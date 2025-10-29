import Link from "next/link";
import Text from "../Text";
import { cn } from "../../utils";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { ReactNode } from "react";

type NavElementProps = {
  label: string;
  href: string;
  as?: string;
  scroll?: boolean;
  chipLabel?: string;
  disabled?: boolean;
  navigationStarts?: () => void;
  icon?: ReactNode;
};

const NavElement = ({
  label,
  href,
  as,
  scroll,
  disabled,
  navigationStarts,
  icon,
}: NavElementProps) => {
  const router = useRouter();
  const isActive =
    href === router.asPath ||
    (as && as === router.asPath) ||
    (router.asPath.startsWith(href) &&
      (router.query.crypto === "SOL" ||
        router.query.crypto === "BTC" ||
        router.query.crypto === "PYTH" ||
        router.query.crypto === "BONK" ||
        router.query.crypto === "ETH" ||
        router.query.crypto === "TIA" ||
        router.query.crypto === "SUI" ||
        router.query.crypto === "JUP"));
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (divRef.current) {
      divRef.current.className = cn(
        "h-0.5 w-1/4 transition-all duration-300 ease-out",
        isActive
          ? "!w-full bg-gradient-to-l from-[#34C796] to-[#0b7a55]"
          : "group-hover:w-1/2 group-hover:bg-gradient-to-l from-[#34C796] to-[#0b7a55]"
      );
    }
  }, [isActive]);

  return (
    <Link
      href={href}
      as={as}
      scroll={scroll}
      passHref
      className={cn(
        "mt-1 bankGothicc group flex h-full flex-col items-center justify-between hover:bg-[#ffffff08] px-2.5 py-0.5 rounded duration-300 ease-out text-[1rem] z-1500",
        disabled && "pointer-events-none cursor-not-allowed opacity-50"
      )}
      onClick={navigationStarts ?? undefined}
    >
      <div className="flex flex-row items-center gap-3 z-1500">
        {icon}
        <Text variant="nav"> {label} </Text>
      </div>
      <div ref={divRef} />
    </Link>
  );
};

export default NavElement;
