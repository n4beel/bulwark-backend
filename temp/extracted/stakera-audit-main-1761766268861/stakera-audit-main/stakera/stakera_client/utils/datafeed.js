import { priceDataState } from "../src/components/globalStatse"; // Import your global state

const lastBarsCache = new Map();

const API_ENDPOINT = "https://benchmarks.pyth.network/v1/shims/tradingview";

const datafeed = {
  onReady: (callback) => {
    console.log("[onReady]: Method call");
    fetch(`${API_ENDPOINT}/config`).then((response) => {
      response.json().then((configurationData) => {
        setTimeout(() => callback(configurationData));
      });
    });
  },
  searchSymbols: (userInput, exchange, symbolType, onResultReadyCallback) => {
    console.log("[searchSymbols]: Method call");
    fetch(`${API_ENDPOINT}/search?query=${userInput}`).then((response) => {
      response.json().then((data) => {
        onResultReadyCallback(data);
      });
    });
  },
  resolveSymbol: (
    symbolName,
    onSymbolResolvedCallback,
    onResolveErrorCallback
  ) => {
    console.log("[resolveSymbol]: Method call", symbolName);
    fetch(`${API_ENDPOINT}/symbols?symbol=${symbolName}`).then((response) => {
      response
        .json()
        .then((symbolInfo) => {
          console.log("[resolveSymbol]: Symbol resolved", symbolInfo);
          let description, pricescale;
          let timezone = symbolInfo.timezone;

          if (symbolName === "Crypto.SOL/USD") {
            description = "SOL/USD";
            pricescale = 1000;
          } else if (symbolName === "Crypto.BTC/USD") {
            description = "BTC/USD";
            pricescale = 10;
          } else if (symbolName === "Crypto.BONK/USD") {
            description = "BONK/USD";
            pricescale = 100000000;
          } else if (symbolName === "Crypto.PYTH/USD") {
            description = "PYTH/USD";
            pricescale = 10000;
          } else if (symbolName === "Crypto.JUP/USD") {
            description = "JUP/USD";
            pricescale = 10000;
          } else if (symbolName === "Crypto.TIA/USD") {
            description = "TIA/USD";
            pricescale = 1000;
          } else if (symbolName === "Crypto.SUI/USD") {
            description = "SUI/USD";
            pricescale = 1000;
          } else if (symbolName === "Crypto.ETH/USD") {
            description = "ETH/USD";
            pricescale = 10;
          } else {
            description = symbolName;
            pricescale = 100;
          }

          setTimeout(() => {
            onSymbolResolvedCallback({
              name: symbolName,
              ticker: symbolName,
              description: description,
              type: "crypto",
              session: "24x7",
              timezone: timezone,
              exchange: "PYTH",
              minmov: 1,
              pricescale: pricescale,
              has_intraday: true,
              has_no_volume: true,
              has_weekly_and_monthly: true,
              // other required properties...
            });
          }, 0);
        })
        .catch((error) => {
          console.log("[resolveSymbol]: Cannot resolve symbol", symbolName);
          onResolveErrorCallback("Cannot resolve symbol");
          return;
        });
    });
  },
  getBars: (
    symbolInfo,
    resolution,
    periodParams,
    onHistoryCallback,
    onErrorCallback
  ) => {
    const { from, to, firstDataRequest } = periodParams;
    console.log("[getBars]: Method call", symbolInfo, resolution, from, to);
    fetch(
      `${API_ENDPOINT}/history?symbol=${symbolInfo.ticker}&from=${periodParams.from}&to=${periodParams.to}&resolution=${resolution}`
    ).then((response) => {
      response
        .json()
        .then((data) => {
          if (data.t.length === 0) {
            onHistoryCallback([], { noData: true });
            return;
          }
          const bars = [];
          for (let i = 0; i < data.t.length; ++i) {
            const multiplier =
              symbolInfo.ticker === "Crypto.BONK/USD" ? 100 : 1;
            bars.push({
              time: data.t[i] * 1000,
              low: data.l[i] * multiplier,
              high: data.h[i] * multiplier,
              open: data.o[i] * multiplier,
              close: data.c[i] * multiplier,
            });
          }
          if (firstDataRequest) {
            lastBarsCache.set(symbolInfo.ticker, {
              ...bars[bars.length - 1],
            });
          }
          onHistoryCallback(bars, { noData: false });
        })
        .catch((error) => {
          console.log("[getBars]: Get error", error);
          onErrorCallback(error);
        });
    });
  },
  subscribeBars: (
    symbolInfo,
    resolution,
    onRealtimeCallback,
    subscriberUID
  ) => {
    const handleNewPriceData = (priceData) => {
      if (priceData) {
        // Validate the timestamp
        if (
          typeof priceData.timestamp !== "string" ||
          isNaN(priceData.timestamp)
        ) {
          console.error("Invalid timestamp:", priceData.timestamp);
          return; // or handle this case appropriately
        }

        // Convert to milliseconds and create a Date object
        const dateTime = priceData.timestamp * 1000;

        // Validate the Date object
        if (isNaN(dateTime)) {
          console.error(
            "Invalid date created from timestamp:",
            priceData.timestamp
          );
          return; // or handle this case appropriately
        }

        // Proceed to create the bar object
        const bar = {
          time: dateTime, // This should now be valid
          open: priceData.price / 1e8, // Adjust according to your data
          high: priceData.price / 1e8,
          low: priceData.price / 1e8,
          close: priceData.price / 1e8,
        };
        onRealtimeCallback(bar);
      }
    };

    // Subscribe to updates for the given symbol
    priceDataState.subscribe(symbolInfo.ticker, handleNewPriceData);
  },
  unsubscribeBars: (subscriberUID) => {},
};

export default datafeed;
