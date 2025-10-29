// globalState.js
export const priceDataState = {
  currentPriceData: {},
  subscribers: new Map(),

  updatePriceData(symbol, data) {
    this.currentPriceData[symbol] = data;
    this.notifySubscribers(symbol);
  },

  subscribe(symbol, callback) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol).add(callback);
  },

  unsubscribe(symbol, callback) {
    if (this.subscribers.has(symbol)) {
      this.subscribers.get(symbol).delete(callback);
    }
  },

  notifySubscribers(symbol) {
    if (this.subscribers.has(symbol)) {
      const specificData = this.currentPriceData[symbol];
      this.subscribers
        .get(symbol)
        .forEach((callback) => callback(specificData));
    }
  },
};
