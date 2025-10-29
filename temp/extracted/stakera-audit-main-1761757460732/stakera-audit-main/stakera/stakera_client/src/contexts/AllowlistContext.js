import React, { createContext, useContext, useState } from "react";

const AllowlistContext = createContext();

export const useAllowlist = () => useContext(AllowlistContext);

export const AllowlistProvider = ({ children }) => {
  const [isAllowed, setIsAllowed] = useState(true); // Default to true

  return (
    <AllowlistContext.Provider value={{ isAllowed, setIsAllowed }}>
      {children}
    </AllowlistContext.Provider>
  );
};
