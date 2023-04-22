'use strict';

const SHA256 = require('sha256');
const uuid = require('uuid').v1;

const currentNodeURL = process.argv[3];

class Blockchain {
  constructor() {
    this.chain = []; // In order to hold the blocks
    this.pendingTransactions = []; // In order to keep track of pending transactions

    this.currentNodeURL = currentNodeURL;
    this.networkNodes = [];

    this.createNewBlock(100, '0', '0'); // Creating the Genesis Block (i.e., first block in the chain)
  }

  chainIsValid(blockchain) {
    let validChain = true;

    for (let i = 1; i < blockchain; i++) {
      const currentBlock = blockchain[i];
      const previousBlock = blockchain[i - 1];
      
      if (currentBlock.getPreviousBlockHash() !== previousBlock.getBlockHash()) {
        validChain = false;
        break;
      }

      const blockHash = this.hashBlock(
        currentBlock.getPreviousBlockHash(),
        this.getCurrentBlockData(currentBlock.getIndex(), currentBlock.getTransactions()),
        currentBlock.getNonce()
      );

      if (!this.validHash(blockHash)) {
        validChain = false;
        break;
      }
    }

    const genesisBlock = blockchain[0];
    
    if (!this.validGenesisBlock(genesisBlock)) {
      validChain = false;
    }

    return validChain;
  }

  validGenesisBlock(genesisBlock) {
    return (
      genesisBlock.getNonce() === 100 &&
      genesisBlock.getPreviousBlockHash() === '0' &&
      genesisBlock.getBlockHash() === '0' &&
      genesisBlock.getTransactions().length === 0
    );
  }

  validHash(hash) {
    return hash.slice(0, 4) === '0000';
  }

  addNewBlock(block) {
    this.chain.push(block);
  }

  addNewTransaction(transaction) {
    this.pendingTransactions.push(transaction);
    return this.getBlockchainLength() + 1;
  }

  createNewBlock(nonce, previousBlockHash, hash) {
    const newBlock = new Block(this.getBlockchainLength() + 1, undefined, this.getPendingTransactions(), nonce, previousBlockHash, hash);
    this.resetTransactions();
    this.addNewBlock(newBlock);
    return newBlock;
  }

  createNewTransaction(amount, sender, recipient) {
    const newTransaction = new Transaction(amount, sender, recipient);
    return newTransaction;
  }

  hashBlock(previousBlockHash, currentBlockData, nonce) {
    const dataAsString = `${previousBlockHash}${JSON.stringify(currentBlockData)}${nonce}`;
    const hashValue = SHA256(dataAsString);
    return hashValue;
  }

  proofOfWork(previousBlockHash, currentBlockData) {
    let nonce = 0;
    let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    while (!this.validHash(hash)) {
      nonce += 1;
      hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
    }
    return nonce;
  }

  resetTransactions() {
    this.pendingTransactions = [];
  }

  setChain(newChain) {
    this.chain = newChain;
  }

  setPendingTransactions(newTransactions) {
    this.pendingTransactions = newTransactions;
  }

  getBlockchainLength() {
    return this.chain.length;
  }

  getPendingTransactions() {
    return this.pendingTransactions;
  }

  getLastBlock() {
    return this.chain[this.getBlockchainLength() - 1];
  }

  getCurrentBlockData(index, transactions) {
    return {
      index: index || this.getBlockchainLength() + 1,
      transactions: transactions || this.getPendingTransactions()
    }
  }

  getBlockchain() {
    return this.chain;
  }

  getNetworkNodes() {
    return this.networkNodes;
  }

  getCurrentNodeURL() {
    return this.currentNodeURL;
  }

  registerNewNode(URL) {
    if (!this.networkNodesIncludes(URL) && !this.isCurrentNode(URL)) {
      this.networkNodes.push(URL);
    }
  }

  isCurrentNode(URL) {
    return this.getCurrentNodeURL() === URL;
  }

  networkNodesIncludes(URL) {
    return this.networkNodes.includes(URL);
  }

}

class Transaction {
  constructor(amount, sender, recipient, transactionID = uuid().replaceAll('-', '')) {
    this.amount = amount;
    this.sender = sender;
    this.recipient = recipient;
    this.transactionID = transactionID;
  }
}

class Block {
  constructor(index, timestamp = Date.now(), transactions, nonce, previousBlockHash, hash) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.nonce = nonce;
    this.previousBlockHash = previousBlockHash;
    this.hash = hash;
  }
  
  getIndex() {
    return this.index;
  }

  getTransactions() {
    return this.transactions;
  }

  getNonce() {
    return this.nonce;
  }

  getBlockHash() {
    return this.hash;
  }

  getPreviousBlockHash() {
    return this.previousBlockHash;
  }
}

module.exports = {
  Blockchain,
  Block,
  Transaction,
};