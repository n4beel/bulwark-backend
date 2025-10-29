import { FC, useEffect, useState, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAutoConnect } from "../contexts/AutoConnectProvider";
import NetworkSwitcher from "./NetworkSwitcher";
import NavElement from "./nav-element";
import useUserSOLBalanceStore from "../../src/stores/useUserSOLBalanceStore";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import Modal from "react-modal";
import { cn } from "../utils";
import { useRouter } from "next/router";
import { FaPaste, FaCoins, FaUsers, FaUser } from "react-icons/fa";
import { FaVault } from "react-icons/fa6";

interface Props {
  isNavOpen: boolean;
  setIsNavOpen: (isOpen: boolean) => void; // if you are using useState, this would be the correct type for the setter.
}

export const AppBar: React.FC<Props> = ({ isNavOpen, setIsNavOpen }) => {
  const { autoConnect, setAutoConnect } = useAutoConnect();
  const [isMobile, setIsMobile] = useState(false);
  const [isMediumScreen, setIsMediumScreen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const divRef = useRef<HTMLDivElement | null>(null);

  const dropdownRef = useRef(null);
  const navRef = useRef(null);
  const [modalIsOpen, setModalIsOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const windowWidth = window.innerWidth;
      setIsMobile(windowWidth <= 768);
      setIsMediumScreen(windowWidth > 768 && windowWidth <= 950);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const router = useRouter();
  const activeRoutes = ["/referralnew", "/vaultnew"]; // add as many routes as you want
  const isActiveButton = activeRoutes.includes(router.asPath);

  useEffect(() => {
    if (divRef.current) {
      divRef.current.className = cn(
        "h-0.5 w-1/4 transition-all duration-300 ease-out",
        isActiveButton
          ? "!w-full bg-gradient-to-l from-[#34C796] to-[#0b7a55]"
          : "group-hover:w-1/2 group-hover:bg-gradient-to-l from-[#34C796] to-[#0b7a55]"
      );
    }
  }, [isActiveButton]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside); // change here

    return () => {
      document.removeEventListener("click", handleClickOutside); // change here
    };
  }, []);

  const wallet = useWallet();
  const { connection } = useConnection();
  const balance = useUserSOLBalanceStore((s) => s.solBalance);
  const { getUserSOLBalance, subscribeToBalanceChanges } =
    useUserSOLBalanceStore();
  const [closeTimeout, setCloseTimeout] = useState(null);
  const modalRef = useRef(null);
  const [mouseInsideButton, setMouseInsideButton] = useState(false);
  const buttonRef = useRef(null);

  const handleMouseLeave = (event) => {
    // We will delay the evaluation and then check
    setTimeout(() => {
      const relatedTarget = event.relatedTarget;

      // If relatedTarget is not a Node, close the modal
      if (!(relatedTarget instanceof Node)) {
        setModalIsOpen(false);
        return;
      }

      // If the relatedTarget is the modal, then do not close the modal
      if (modalRef.current && modalRef.current.contains(relatedTarget)) {
        return;
      }

      // If the relatedTarget is outside both the button and the modal, close the modal
      if (
        modalRef.current &&
        buttonRef.current &&
        !modalRef.current.contains(relatedTarget) &&
        !buttonRef.current.contains(relatedTarget)
      ) {
        setModalIsOpen(false);
      }
    }, 50); // Small delay to let the relatedTarget update if moving to the modal
  };

  const handleMouseEnterModal = () => {
    // Clear the timeout to keep the modal open.
    if (closeTimeout) {
      clearTimeout(closeTimeout);
      setCloseTimeout(null);
    }
  };

  const handleMouseEnterButton = () => {
    const rect = buttonRef.current.getBoundingClientRect();

    setPosition({
      top: `${rect.bottom}px`,
      left: `${rect.left}px`,
    });
    // If the mouse re-enters the modal or button before the delay, we clear the timeout
    if (closeTimeout) {
      clearTimeout(closeTimeout);
    }
    // Assuming you want the modal to stay open when the mouse re-enters
    setModalIsOpen(true);
  };

  useEffect(() => {
    if (wallet.publicKey) {
      subscribeToBalanceChanges(wallet.publicKey, connection);
    }
  }, [
    wallet.publicKey,
    connection,
    getUserSOLBalance,
    subscribeToBalanceChanges,
  ]);

  const { connected } = useWallet();

  const [position, setPosition] = useState({ top: "0px", left: "0px" });

  return (
    <div
      ref={navRef}
      className="w-full flex items-center justify-center h-[55px] flex-row  text-[#E0E5EA] mb:pt-1"
    >
      <div className="flex items-center justify-between w-[90%]">
        <div className="flex items-center">
          {!isMobile && (
            <div className="flex justify-center items-center">
              <Link href="/">
                <div>
                  <img
                    src="/popfismall.png"
                    alt="Logo"
                    className="w-[48px] h-[48px]"
                  />
                </div>
              </Link>
            </div>
          )}
          {isMobile ? (
            // Code for Mobile

            <Link href="/lottery">
              <button className="relative overflow-hidden py-1.5 rounded-lg bg-new-green hover:bg-new-green-dark cursor-pointer font-semibold leading-[normal] min-w-[160px] text-center text-lg text-black transition ease-in-out duration-300">
                OPEN APP
              </button>
            </Link>
          ) : (
            <>
              {!isMediumScreen && (
                // Code for Large Screens
                <>
                  <span className=" mx-0.5 z-10"></span>
                  <NavElement
                    label="Lottery"
                    href="/lottery"
                    navigationStarts={() => setIsNavOpen(false)}
                  />
                </>
              )}
              {isMediumScreen && (
                // Code for Regular Screens (not Medium)
                <div className="flex items-center ">
                  <>
                    <span className=" mx-0.5 z-10"></span>
                    {/* <NavElement
                      label="Options"
                      href="/trade"
                      navigationStarts={() => setIsNavOpen(false)}
                    /> */}
                    <span className="mx-0.5 z-10"></span>
                    <NavElement
                      label="Lottery"
                      href="/lottery"
                      navigationStarts={() => setIsNavOpen(false)}
                    />
                    <span className="mx-0.5 z-10"></span>
                  </>
                </div>
              )}
            </>
          )}
        </div>

        <div className=" -end flex items-center">
          {!isMobile && !isMediumScreen && (
            <div className="hidden md:inline-flex align-items-center justify-items relative items-center text-lg">
              <div className="flex items-center">
                <Link href="/lottery">
                  <button className="relative overflow-hidden py-1.5 rounded-lg bg-new-green hover:bg-new-green-dark cursor-pointer font-semibold leading-[normal] min-w-[160px] text-center text-lg text-black transition ease-in-out duration-300">
                    OPEN APP
                  </button>
                </Link>
              </div>
            </div>
          )}
          {isMobile && (
            <>
              <label
                htmlFor="my-drawer"
                className="btn-gh items-center justify-between md:hidden relative"
                onClick={() => setIsNavOpen(!isNavOpen)}
              >
                <div className="HAMBURGER-ICON space-y-2.5">
                  <div className="h-0.5 w-8 bg-gradient-to-tr from-grey-text to-white" />
                  <div className="h-0.5 w-8 bg-gradient-to-tr from-grey-text to-white" />
                  <div className="h-0.5 w-8 bg-gradient-to-tr from-grey-text to-white" />
                </div>
              </label>
            </>
          )}
          {isMediumScreen && (
            <div className=" flex items-center ml-auto">
              <Link href="/lottery">
                <button className="relative overflow-hidden py-1.5 rounded-lg bg-new-green hover:bg-new-green-dark cursor-pointer font-semibold leading-[normal] min-w-[160px] text-center text-lg text-black transition ease-in-out duration-300">
                  OPEN APP
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppBar;
