import { FC } from "react";
import Link from "next/link";
import SolanaTPS from "./SolanaTPS"; // import your SolanaTPS component
import React, { useState, useEffect } from "react";
import { IoIosDocument } from "react-icons/io";
import { FaBook } from "react-icons/fa";
import { IoDocumentText } from "react-icons/io5";

export const Footer: FC = () => {
  const [slogan, setSlogan] = useState("");

  useEffect(() => {
    const slogans = [
      "Popping potential in every trade.",
      "Make it pop in every trade.",
    ];

    // Choose a random slogan
    const randomSlogan = slogans[Math.floor(Math.random() * slogans.length)];

    setSlogan(randomSlogan);
  }, []);

  return (
    <div className="flex justify-center bg-layer-1 ">
      <div className="h-20 text-gray-200 flex items-center justify-between  w-[95%] max-w-[1700px] flex flex-row items-center justify-between text-mini-7">
        <a href="/" className="no-underline">
          <div className="flex flex-row items-center justify-start gap-[5px]">
            <img
              className="ml-1 w-[18.1px] relative h-[19.5px]"
              alt=""
              src="/group-11.svg"
            />
            <div className="font-gilroy-semibold text-white w-[50.2px] relative tracking-[-0.03em] leading-[120.41%] inline-block h-[14.6px] shrink-0">
              Stakera
            </div>
          </div>
        </a>
        <div className="hidden sm:flex px-2 relative justify-center items-center text-center text-sm leading-[150%] font-gilroy-regular opacity-[0.5]">
          Stakera is currently in beta. Please proceed with caution and be aware
          of potential risks.
        </div>
        <div className="sm:hidden px-2 relative flex justify-center items-center text-center text-sm leading-[150%] font-gilroy-regular opacity-[0.5]">
          Stakera is currently in beta.
        </div>
        <div className="flex flex-row items-center justify-start gap-[13px] opacity-[0.5]">
          <a
            href={`https://docs.stakera.io`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            <IoDocumentText className="cursor-pointer text-[#97a4a0] w-[20px] relative h-[17px] overflow-hidden shrink-0 object-cover"></IoDocumentText>
          </a>

          <a
            href={`https://discord.gg/cpJ2GF6Skc`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            <img
              className="cursor-pointer w-[20px] relative h-[20px] overflow-hidden shrink-0 object-cover"
              alt=""
              src="/icon--youtube@2x.png"
            />
          </a>
          <a
            href="https://x.com/stakera_io"
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            <img
              className="cursor-pointer w-[20px] relative h-[20px] overflow-hidden shrink-0"
              alt=""
              src="/icon--x.svg"
            />
          </a>
        </div>
      </div>
    </div>
  );
};

export default Footer;
