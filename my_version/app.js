'use strict';

const express = require('express');
const uuid = require('uuid').v1;
const { Blockchain, Block, Transaction } = require('./lib/blockchain.js');

const app = express();
const nodeAddress = uuid().replaceAll('-', '');
const bitcoin = new Blockchain();

const PORT = process.argv[2];
const HOST = 'localhost';

app.use(express.urlencoded({ extended: false })); // In order to parse the body for URLEncoded data serialization format
app.use(express.json()); // In order to parse the body for JSON data serialization format

app.get('/blockchain', (req, res) => {
  res.send(bitcoin);
});

app.get('/consensus', async (req, res) => {
  const requestPromises = [];
  bitcoin.getNetworkNodes().forEach(networkNodeURL => {
    const config = {
      url: `${networkNodeURL}/blockchain`,
      method: 'GET'
    };

    requestPromises.push(fetch(config.url, { method: config.method }));
  });

  const responses = await Promise.all(requestPromises);
  const blockchains = [];
  for (let idx = 0; idx < responses.length; idx++) {
    const response = await responses[idx].json();
    blockchains.push(response);
  }

  const currentChainLength = bitcoin.getBlockchainLength();
  let maxChainLength = currentChainLength;
  let newLongestChain;
  let newPendingTransactions;
  
  blockchains.forEach(blockchain => {
    if (blockchain.chain.length > maxChainLength) {
      maxChainLength = blockchain.chain.length;
      newLongestChain = blockchain.chain;
      newPendingTransactions = blockchain.pendingTransactions;
    }
  });

  let note;
  let chain;
  if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
    note = 'Current chain has not been replaced.';
    chain = bitcoin.chain;  
  } else {
    bitcoin.setChain(newLongestChain);
    bitcoin.setPendingTransactions(newPendingTransactions);
    note = 'This blockchain has been replaced.';
    chain = bitcoin.getBlockchain();
  }

  res.json({ note, chain });

});

app.get('/mine', async (req, res) => {
  const lastBlock = bitcoin.getLastBlock();
  const previousBlockHash = lastBlock.getBlockHash();
  
  const currentBlockData = bitcoin.getCurrentBlockData();
  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
  const hash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, hash);

  const requestPromises = []; 
  bitcoin.getNetworkNodes().forEach(networkNodeURL => {
    const config = {
      url: `${networkNodeURL}/receive-new-block`,
      method: 'POST', 
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(newBlock),
    };

    requestPromises.push(fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': config.contentType
        },
        body: config.body
      })
    );
  });

  await Promise.all(requestPromises);

  const config = {
    url: `${bitcoin.getCurrentNodeURL()}/transaction/broadcast`,
    method: 'POST',
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      amount: 12.5,
      sender: "00",
      recipient: nodeAddress
    })
  };
  
  await fetch(config.url, {
    method: config.method,
    headers: {
      'Content-Type': config.contentType
    },
    body: config.body
  });

  res.json({
    note: "New block mined successfully!",
    block: newBlock
  });
});

app.post('/receive-new-block', (req, res) => {
  const { index, timestamp, transactions, nonce, previousBlockHash, hash } = req.body;
  const newBlock = new Block(index, timestamp, transactions, nonce, previousBlockHash, hash);
  const lastBlock = bitcoin.getLastBlock();
  
  const correctHash = lastBlock.getBlockHash() === newBlock.getPreviousBlockHash();
  const correctIndex = lastBlock.getIndex() + 1 === newBlock.getIndex();

  let note;
  if (correctHash && correctIndex) {
    bitcoin.addNewBlock(newBlock);
    bitcoin.resetTransactions();
    note = 'New received and accepted.';
  } else {
    note = 'New block rejected.';
  }

  res.json({ note, newBlock });
});

app.post('/transaction', (req, res) => {
  const { amount, sender, recipient, transactionID } = req.body;
  const newTransaction = new Transaction(amount, sender, recipient, transactionID);
  const blockIndex = bitcoin.addNewTransaction(newTransaction);
  res.json({ note: `Transaction will be added to the block number ${blockIndex}.`});
});

app.post('/transaction/broadcast', async (req, res) => {
  const { amount, sender, recipient } = req.body;
  const newTransaction = bitcoin.createNewTransaction(amount, sender, recipient);
  bitcoin.addNewTransaction(newTransaction);

  const requestPromises = []; 
  bitcoin.getNetworkNodes().forEach(networkNodeURL => {
    const config = {
      url: `${networkNodeURL}/transaction`,
      method: 'POST', 
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(newTransaction),
    };

    requestPromises.push(fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': config.contentType
        },
        body: config.body
      })
    );
  });

  await Promise.all(requestPromises);

  res.json({ note: 'New transaction created and broadcasted successfully.' });
});

// Register a node and broadcast it to the rest of the network
app.post('/register-and-broadcast-node', async (req, res) => {
  const newNodeURL = req.body.newNodeURL;
  bitcoin.registerNewNode(newNodeURL);
  
  const networkNodes = bitcoin.getNetworkNodes(); 
  const registerNodesPromises = [];
  
  for (let idx = 0; idx < networkNodes.length; idx++) {
    const config = {
      url: `${networkNodes[idx]}/register-node`,
      method: 'POST',
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ newNodeURL }),
    }

    registerNodesPromises.push(
      fetch(config.url, {
        method: config.method,
        headers: {
          'Content-Type': config.contentType
        },
        body: config.body 
      })
    );
  }
  
  await Promise.all(registerNodesPromises);
  
  const config = {
    url: `${newNodeURL}/register-nodes-bulk`,
    method: 'POST',
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ allNetworkNodes: [ ...bitcoin.getNetworkNodes(), bitcoin.getCurrentNodeURL() ] })
  }

  await fetch(config.url, {
      method: config.method,
      headers: {
        'Content-Type': config.contentType
      },
      body: config.body
  });
  
  res.json({ note: 'New node successfully registered with network.'});

});

// Register a node with the network
app.post('/register-node', (req, res) => {
  const newNodeURL = req.body.newNodeURL;
  bitcoin.registerNewNode(newNodeURL);
  res.json({ note: 'New node registered successfully.'})
});

// Register multiple nodes at once
app.post('/register-nodes-bulk', (req, res) => {
  const allNetworkNodes = req.body.allNetworkNodes;
  allNetworkNodes.forEach(networkNodeURL => {
    bitcoin.registerNewNode(networkNodeURL);
  });
  res.json({ note: 'Bulk registration successful.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Listening on port ${PORT} ...`);
});