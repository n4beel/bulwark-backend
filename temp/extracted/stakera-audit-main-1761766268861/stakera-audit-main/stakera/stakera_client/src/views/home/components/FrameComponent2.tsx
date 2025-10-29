import { FunctionComponent } from "react";
import Link from "next/link";

export type FrameComponent8Type = {
  className?: string;
};

const FrameComponent8: FunctionComponent<FrameComponent8Type> = ({
  className = "",
}) => {
  return (
    <section
      className={`self-stretch rounded-3xl overflow-hidden flex flex-col items-start justify-start pt-12 md:pb-[104px] pb-12 px-6 md:px-12 box-border gap-[18px] bg-[url('/public/frame-2085660334@3x.png')] bg-cover bg-no-repeat bg-[top] max-w-full text-left text-13xl text-neutral-06 font-gilroy-semibold mq750:pl-6 mq750:box-border ${className}`}
      style={{
        backgroundImage: "url('/frame-2085660334@3x.png')",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "top",
      }}
    >
      <h1 className="m-0 w-[401px] relative text-inherit tracking-[-0.03em] leading-[120.41%] font-normal font-[inherit] inline-block max-w-full ">
        Start Winning on top of your Solana now.
      </h1>
      <Link href="/lottery" className="no-underline">
        <button className="hover:opacity-50 transition ease-in-out duration-300 cursor-pointer [border:none] py-[7px] pl-4 pr-3 bg-primary rounded-lg overflow-hidden flex flex-row items-start justify-start gap-1">
          <div className="flex flex-col items-start justify-start pt-[2.5px] px-0 pb-0">
            <div className="relative text-base tracking-[-0.03em] leading-[120.41%] font-gilroy-semibold text-bg text-left inline-block min-w-[84px]">
              Launch App
            </div>
          </div>
          <img
            className="h-6 w-6 relative min-h-[24px]"
            alt=""
            src="/vuesaxlineararrowright.svg"
          />
        </button>{" "}
      </Link>
    </section>
  );
};

export default FrameComponent8;
