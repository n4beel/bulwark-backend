import Text from "./Text";
import Link from "next/link";

import NavElement from "./nav-element";
import React, { useRef, useEffect, Dispatch, SetStateAction } from "react";
import { disableBodyScroll, enableBodyScroll } from "body-scroll-lock";

interface Props {
  children: React.ReactNode;
  isNavOpen: boolean;
  setIsNavOpen: (isOpen: boolean) => void;
  setIsContentContainerOpen: Dispatch<SetStateAction<boolean>>;
}

export const ContentContainer: React.FC<Props> = ({
  setIsContentContainerOpen,
  children,
  isNavOpen,
  setIsNavOpen,
}) => {
  const drawerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!drawerRef.current.contains(event.target)) {
        setIsNavOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const checkboxRef = useRef(null);

  useEffect(() => {
    const checkbox = checkboxRef.current;

    if (checkbox) {
      const handleChange = () => {
        setIsContentContainerOpen(checkbox.checked);
      };

      checkbox.addEventListener("change", handleChange);

      // Initialize the state on mount
      handleChange();

      // Clean up the event listener on unmount
      return () => {
        checkbox.removeEventListener("change", handleChange);
      };
    }
  }, []);

  return (
    <div ref={drawerRef} className="flex-1 drawer overflow-hidden">
      <input
        id="my-drawer"
        type="checkbox"
        className="grow drawer-toggle"
        ref={checkboxRef}
      />
      <div className="items-center drawer-content">{children}</div>
      {/* SideBar / Drawer */}
      <div className="drawer-side ]">
        <label htmlFor="my-drawer" className="drawer-overlay gap-6"></label>

        <ul className="p-2 menu w-48 bg-[#080808] sm:flex items-start">
          <li>
            <div className="flex w-16 pt-2 mb-1">
              <Link href="/">
                <div>
                  <img
                    src="/broslaf.png"
                    alt="Logo"
                    className="min-w-[130px]"
                  />
                </div>
              </Link>
            </div>
          </li>
          <li>
            <NavElement label="Profile" href="/profile" />
          </li>
          <li>
            <NavElement label="Futures" href="/futures" />
          </li>

          <li>
            <NavElement label="Stats" href="/stats" />
          </li>
          <li>
            <NavElement label="Vault" href="/vault" />
          </li>
        </ul>
      </div>
    </div>
  );
};
