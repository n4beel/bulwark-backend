import { FC, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useNetworkConfiguration } from "../contexts/NetworkConfigurationProvider";

const NetworkSwitcher: FC = () => {
  const { networkConfiguration, setNetworkConfiguration } =
    useNetworkConfiguration();
  const [isChecked, setIsChecked] = useState(
    networkConfiguration === "mainnet-beta"
  );
  const [label, setLabel] = useState("Papertrading");

  useEffect(() => {
    setLabel(networkConfiguration === "mainnet-beta" ? "Mainnet" : "Devnet");
  }, [networkConfiguration]);

  const toggleNetwork = (e) => {
    e.stopPropagation(); // Add this line
    const newNetwork = isChecked ? "devnet" : "mainnet-beta";
    setIsChecked(!isChecked);
    setNetworkConfiguration(newNetwork);
  };

  const explanation = `Toggle between ${label} and the Mainnet.`;

  return (
    <>
      <label
        className="text-slate-300 font-semibold cursor-pointer label"
        title={explanation}
      >
        <span>{label}</span>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={toggleNetwork}
          className="toggle"
        />
      </label>
    </>
  );
};

export default dynamic(() => Promise.resolve(NetworkSwitcher), {
  ssr: false,
});
