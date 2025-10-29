import { FunctionComponent, useMemo, type CSSProperties } from "react";

export type FrameComponent9Type = {
  className?: string;
  group1?: string;

  /** Style props */
  propHeight?: CSSProperties["height"];
  propWidth?: CSSProperties["width"];
  propMinHeight?: CSSProperties["minHeight"];
  propHeight1?: CSSProperties["height"];
  propFontSize?: CSSProperties["fontSize"];
  propMinWidth?: CSSProperties["minWidth"];
};

const FrameComponent9: FunctionComponent<FrameComponent9Type> = ({
  className = "",
  group1,
  propHeight,
  propWidth,
  propMinHeight,
  propHeight1,
  propFontSize,
  propMinWidth,
}) => {
  const groupIcon1Style: CSSProperties = useMemo(() => {
    return {
      height: propHeight,
      width: propWidth,
      minHeight: propMinHeight,
    };
  }, [propHeight, propWidth, propMinHeight]);

  const stakera1Style: CSSProperties = useMemo(() => {
    return {
      height: propHeight1,
      fontSize: propFontSize,
      minWidth: propMinWidth,
    };
  }, [propHeight1, propFontSize, propMinWidth]);

  return (
    <div className="Gilroy-Semibold flex flex-row items-center justify-start gap-[7.4px]">
      <img
        className="ml-1 w-[27.2px] relative h-[29.2px]"
        alt=""
        src="/group-1.svg"
      />
      <div className="text-[22px] text-white justify-center items-start tracking-[-0.01em] leading-[120.41%] inline-block shrink-0 pt-0.5">
        Stakera
      </div>
    </div>
  );
};

export default FrameComponent9;
