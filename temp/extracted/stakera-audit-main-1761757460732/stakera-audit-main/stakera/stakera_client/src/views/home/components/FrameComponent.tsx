import { FunctionComponent, useMemo, type CSSProperties } from "react";

export type FrameComponentType = {
  className?: string;
  vuesaxbulkimport?: string;
  deposit?: string;
  depositYourTokensAndStart?: string;

  /** Style props */
  propMinHeight?: CSSProperties["minHeight"];
};

const FrameComponent: FunctionComponent<FrameComponentType> = ({
  className = "",
  propMinHeight,
  vuesaxbulkimport,
  deposit,
  depositYourTokensAndStart,
}) => {
  const frameDiv3Style: CSSProperties = useMemo(() => {
    return {
      minHeight: propMinHeight,
    };
  }, [propMinHeight]);

  return (
    <div
      className={`self-stretch w-full flex-1 rounded-3xl bg-bg flex flex-col items-start justify-start py-6 md:px-12 px-6 box-border max-w-full text-left xl:text-[40px] md:text-[35px] text-[30px] text-neutral-06 font-gilroy-bold  ${className}`}
      style={frameDiv3Style}
    >
      <div className="self-stretch flex flex-col items-start justify-start gap-2">
        <div className="flex flex-row md:flex-col items-start justify-start gap-2 md:gap-0">
          <img
            className="w-16 h-16 relative flex justify-center items-center"
            loading="lazy"
            alt=""
            src={vuesaxbulkimport}
          />
          <h1 className="flex justify-center items-center m-0 self-stretch relative text-inherit tracking-[-0.03em] leading-[58px] font-normal font-[inherit]">
            {deposit}
          </h1>
        </div>
        <div className="self-stretch relative text-lg tracking-[-0.03em] leading-[120.41%] font-gilroy-regular text-gray-300">
          {depositYourTokensAndStart}
        </div>
      </div>
    </div>
  );
};

export default FrameComponent;
