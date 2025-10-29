import React, { useRef, useEffect, useState } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import io from "socket.io-client";

interface Price {
  _id: string;
  symbol: string;
  price: number;
  timestamp: string;
}

interface Position {
  _id: string;
  futuresContract: string;
  playerAcc: string;
  initialPrice: number;
  betAmount: number;
  priceDirection: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  liquidationPrice: number;
  symbol: number;
  resolved: boolean;
  winner: string | null;
  finalPrice: number;
  currentPrice: number;
  pnl: number;
}

interface ChartComponentProps {
  symbol: string;
  latestOpenedPosition: Record<string, Position | null>; // Add this line
}

const ChartComponent: React.FC<ChartComponentProps> = ({
  symbol,
  latestOpenedPosition,
}) => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [candlestickSeries, setCandlestickSeries] = useState<any | null>(null);
  const [chart, setChart] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any | null>(null);
  const seriesRef = useRef([]);
  const [latestPositions, setLatestPositions] = useState<
    Record<string, Position | null>
  >({});

  const SYMBOL_MAPPING = {
    0: "Crypto.SOL/USD",
    1: "Crypto.BTC/USD",
    // add more pairs if needed
  };

  useEffect(() => {
    if (
      !chart ||
      !latestOpenedPosition ||
      latestOpenedPosition.length === null
    ) {
      return;
    }

    const position = latestOpenedPosition[symbol];

    if (
      !position ||
      !position.resolved ||
      SYMBOL_MAPPING[position.symbol] !== symbol
    ) {
      return;
    }

    // Remove all previous series
    seriesRef.current.forEach((series) => chart.removeSeries(series));
    seriesRef.current = []; // Reset the reference
  }, [chart, latestPositions]);

  useEffect(() => {
    if (!chart) return;

    // Remove all previous series
    seriesRef.current.forEach((series) => chart.removeSeries(series));
    seriesRef.current = []; // Reset the reference

    const symbolPosition = latestPositions[symbol];

    if (!symbolPosition || symbolPosition.resolved) {
      return;
    }

    let { liquidationPrice } = symbolPosition;
    const { initialPrice, stopLossPrice, takeProfitPrice, priceDirection } =
      symbolPosition;

    // Adjust liquidationPrice based on stopLossPrice and direction
    if (
      (priceDirection === 0 &&
        stopLossPrice !== 0 &&
        stopLossPrice > liquidationPrice) ||
      (priceDirection === 1 &&
        stopLossPrice !== 0 &&
        stopLossPrice < liquidationPrice)
    ) {
      liquidationPrice = stopLossPrice;
    }
    const minTime = Math.min(...data.map((d) => d.time));
    const maxTime = Math.max(...data.map((d) => d.time));

    // Create a new series for each line
    const initialPriceLineSeries = chart.addLineSeries();
    const stopLossLineSeries = chart.addLineSeries();
    const takeProfitLineSeries = chart.addLineSeries();
    const liquidationPriceLineSeries = chart.addLineSeries();

    if (initialPrice !== 0) {
      initialPriceLineSeries.setData([
        { time: minTime, value: initialPrice / 1e8 },
        { time: maxTime, value: initialPrice / 1e8 },
      ]);
      initialPriceLineSeries.applyOptions({
        lineWidth: 1,
        color: "#fff133",
        lineStyle: LineStyle.Dotted,
      });
      seriesRef.current.push(initialPriceLineSeries); // Keep a reference
    }

    if (stopLossPrice !== 0) {
      stopLossLineSeries.setData([
        { time: minTime, value: stopLossPrice / 1e8 },
        { time: maxTime, value: stopLossPrice / 1e8 },
      ]);
      stopLossLineSeries.applyOptions({
        lineWidth: 1,
        color: "#FF3333",
        lineStyle: LineStyle.Dotted,
      });
      seriesRef.current.push(stopLossLineSeries); // Keep a reference
    }

    if (takeProfitPrice !== 0) {
      takeProfitLineSeries.setData([
        { time: minTime, value: takeProfitPrice / 1e8 },
        { time: maxTime, value: takeProfitPrice / 1e8 },
      ]);
      takeProfitLineSeries.applyOptions({
        lineWidth: 1,
        color: "#4bffb5",
        lineStyle: LineStyle.Dotted,
      });
      seriesRef.current.push(takeProfitLineSeries); // Keep a reference
    }

    if (liquidationPrice !== 0) {
      liquidationPriceLineSeries.setData([
        { time: minTime, value: liquidationPrice / 1e8 },
        { time: maxTime, value: liquidationPrice / 1e8 },
      ]);
      liquidationPriceLineSeries.applyOptions({
        lineWidth: 1,
        color: "#e73662",
        lineStyle: LineStyle.Dotted,
      });
      seriesRef.current.push(liquidationPriceLineSeries); // Keep a reference
    }
  }, [chart, latestPositions, symbol, data]);

  useEffect(() => {
    if (!latestOpenedPosition) return;
    console.log("latestoppo", latestOpenedPosition);

    const updatedPositions = {};

    for (const key in latestOpenedPosition) {
      const position = latestOpenedPosition[key];

      // If the position is null, update it accordingly in latestPositions.
      if (position === null) {
        updatedPositions[SYMBOL_MAPPING[key]] = null;
        continue;
      }

      // Ensure position exists and maps to the current symbol.
      if (position && SYMBOL_MAPPING[position.symbol] === symbol) {
        updatedPositions[SYMBOL_MAPPING[position.symbol]] = position;
      }
    }

    if (Object.keys(updatedPositions).length) {
      setLatestPositions((prev) => ({ ...prev, ...updatedPositions }));
    }
  }, [latestOpenedPosition, symbol]);

  const ENDPOINT3 = process.env.NEXT_PUBLIC_ENDPOINT3;
  const ENDPOINT1 = process.env.NEXT_PUBLIC_ENDPOINT1;

  useEffect(() => {
    const socket = io(ENDPOINT3);
    socket.on("connect_error", (err) => {
      console.log("Error connecting to server:", err);
      setError(err);
    });

    socket.on("prices", (prices: Price[]) => {
      const newCandlesticks = prices.reverse().map((price) => ({
        time: Number(price.timestamp),
        id: price._id,
        open: price.price / 1e8,
        high: price.price / 1e8,
        low: price.price / 1e8,
        close: price.price / 1e8,
      }));

      setData((prevData) => {
        const newData = mergeCandlesticks(prevData, newCandlesticks);
        const sortedData = sortCandlesticks(newData);
        return sortedData;
      });

      setLoading(false);
    });

    // Emit the 'subscribe' event with the desired symbol
    socket.emit("subscribe", symbol);

    return () => {
      socket.disconnect();
    };
  }, [symbol]);

  useEffect(() => {
    if (!loading) {
      const newSocket = io(ENDPOINT1);
      newSocket.on("connect_error", (err) => {
        console.log("Error connecting to server:", err);
        setError(err);
      });

      newSocket.on("priceUpdate", (newPrices: any[]) => {
        const symbolPrice = newPrices.find((price) => price.symbol === symbol);

        if (symbolPrice && symbolPrice.timestamp) {
          const timestamp = Number(symbolPrice.timestamp);

          if (!isNaN(timestamp)) {
            // Check if timestamp is valid number
            const candlestick = {
              time: timestamp,
              id: "",
              open: symbolPrice.price / 1e8,
              high: symbolPrice.price / 1e8,
              low: symbolPrice.price / 1e8,
              close: symbolPrice.price / 1e8,
            };

            setData((prevData) => {
              // only add new data if timestamp is higher than the latest data
              if (
                prevData.length > 0 &&
                prevData[prevData.length - 1].time >= timestamp
              ) {
                return prevData;
              }

              const newData = mergeCandlesticks(prevData, [candlestick]);
              const sortedData = sortCandlesticks(newData);
              return sortedData;
            });
          } else {
            console.log("Invalid timestamp:", symbolPrice.timestamp);
          }
        }
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [symbol, loading]);

  useEffect(() => {
    const chartContainer = chartContainerRef.current;

    if (chartContainer && data.length && !chart) {
      const newChart = createChart(chartContainer, {
        width: chartContainer.clientWidth,
        height: chartContainer.clientHeight,
        layout: {
          background: { color: "#1a1a25" },
          textColor: "#DDD",
        },
        grid: {
          vertLines: { color: "#444" },
          horzLines: { color: "#444" },
        },
        localization: {
          timeFormatter: (timestamp: number) => {
            const date = new Date(timestamp * 1000);
            const timeOptions: Intl.DateTimeFormatOptions = {
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "numeric",
            };
            return date.toLocaleTimeString([], timeOptions);
          },
        },
        timeScale: {
          rightOffset: 12,
          barSpacing: 3,
          fixLeftEdge: true,
          lockVisibleTimeRangeOnResize: true,
          rightBarStaysOnScroll: true,
          borderVisible: false,
          borderColor: "#fff000",
          visible: true,
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const newCandlestickSeries = newChart.addCandlestickSeries();

      newCandlestickSeries.applyOptions({
        borderVisible: false,
        wickVisible: true,
        upColor: "#4bffb5",
        downColor: "#ff4976",
        wickUpColor: "#4bffb5",
        wickDownColor: "#ff4976",
      });

      newCandlestickSeries.setData(data);
      newCandlestickSeries.applyOptions({
        borderVisible: false,
        wickVisible: true,
      });

      newChart.timeScale().applyOptions({
        borderColor: "#71649C",
      });

      setChart(newChart);
      setCandlestickSeries(newCandlestickSeries);
    }
  }, [chartContainerRef, data, chart]);

  useEffect(() => {
    if (candlestickSeries && data.length) {
      const lastData = data[data.length - 1];
      candlestickSeries.update(lastData);
    }
  }, [candlestickSeries, data]);

  useEffect(() => {
    const handleResize = () => {
      if (chart) {
        chart.resize(
          chartContainerRef.current.clientWidth,
          chartContainerRef.current.clientHeight
        );
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [chart]);

  const mergeCandlesticks = (
    prevCandlesticks: any[],
    newCandlesticks: any[]
  ) => {
    const mergedCandlesticks = [...prevCandlesticks];

    // Get the most recent candlestick
    let latestCandlestick = mergedCandlesticks[mergedCandlesticks.length - 1];

    for (const newCandlestick of newCandlesticks) {
      // Normalize timestamp to the nearest 4-second mark
      newCandlestick.time = Math.floor(newCandlestick.time / 30) * 30;

      if (latestCandlestick && latestCandlestick.time === newCandlestick.time) {
        // If the newCandlestick is within the 4-second window of the latestCandlestick,
        // update the latestCandlestick instead of creating a new one
        latestCandlestick.high = Math.max(
          latestCandlestick.high,
          newCandlestick.close
        );
        latestCandlestick.low = Math.min(
          latestCandlestick.low,
          newCandlestick.close
        );
        latestCandlestick.close = newCandlestick.close;
      } else if (
        latestCandlestick &&
        latestCandlestick.time >= newCandlestick.time
      ) {
        console.error(
          "Received a timestamp that is earlier than the latest timestamp:",
          newCandlestick
        );
        // Optionally throw an error or handle this case differently
      } else {
        // If the newCandlestick is outside the 4-second window of the latestCandlestick,
        // create a new candlestick
        const newCandlestickData = {
          ...newCandlestick,
          open: newCandlestick.close,
          high: newCandlestick.close,
          low: newCandlestick.close,
        };

        mergedCandlesticks.push(newCandlestickData);
        latestCandlestick = newCandlestickData; // Update the reference to the most recent candlestick
      }
    }

    return mergedCandlesticks;
  };

  const sortCandlesticks = (candlesticks: any[]) => {
    return candlesticks.sort((a, b) => a.time - b.time);
  };

  useEffect(() => {
    const chartContainer = chartContainerRef.current;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!Array.isArray(entries) || !entries.length) {
        return;
      }
      if (chart) {
        chart.resize(
          entries[0].contentRect.width,
          entries[0].contentRect.height
        );
      }
    });

    if (chartContainer) {
      resizeObserver.observe(chartContainer);
    }

    return () => {
      if (chartContainer) {
        resizeObserver.unobserve(chartContainer);
      }
    };
  }, [chart]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: "100%", height: "100%" }}
      className=""
    />
  );
};

export default ChartComponent;
