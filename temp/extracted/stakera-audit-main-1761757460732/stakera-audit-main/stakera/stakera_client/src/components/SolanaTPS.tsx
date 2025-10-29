import { useEffect, useState } from "react";

function SolanaTPS() {
  const [tps, setTPS] = useState(null);
  const ENDPOINT = process.env.NEXT_PUBLIC_ENDPOINT2;

  //   useEffect(() => {
  //     const intervalId = setInterval(fetchTPS, 60000); // update TPS every 15 seconds
  //     async function fetchTPS() {
  //       try {
  //         const response = await fetch(`${ENDPOINT}/api/tps`); // Replace with your server's URL
  //         const json = await response.json();
  //         setTPS(json.tps);
  //       } catch (error) {
  //         console.error("Error fetching TPS, retrying in 5 seconds...", error);
  //         setTimeout(fetchTPS, 5000); // Retry after 5 seconds
  //       }
  //     }

  //     fetchTPS();
  //  // Fetch TPS immediately on component mount

  //     return () => clearInterval(intervalId); // clear interval on component unmount
  //   }, []);

  const tpsColor = tps > 2000 ? "text-primary" : "text-short";

  return (
    <div className="leading-[14px] flex justify-center items-center font-poppins text-basic ml-2 text-sm">
      <span className={`${tpsColor} mr-1 font-regular font-poppinssad`}>
        &#9679;
      </span>
      TPS: {tps ? tps.toFixed(0) : "-"}
    </div>
  );
}

export default SolanaTPS;
