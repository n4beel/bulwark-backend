import { FunctionComponent, useMemo, type CSSProperties } from "react";

export type Frame1Type = {
  className?: string;
  users?: string;
  prop?: string;

  /** Style props */
  frameDivFlex?: CSSProperties["flex"];
  frameDivPosition?: CSSProperties["position"];
  frameDivBorderRadius?: CSSProperties["borderRadius"];
  frameDivBackgroundColor?: CSSProperties["backgroundColor"];
  frameDivPadding?: CSSProperties["padding"];
  frameDivGap?: CSSProperties["gap"];
  frameDivAlignSelf?: CSSProperties["alignSelf"];
  frameDivBackdropFilter?: CSSProperties["backdropFilter"];
  frameDivMinWidth?: CSSProperties["minWidth"];
  usersColor?: CSSProperties["color"];
  divFontSize?: CSSProperties["fontSize"];
  divColor?: CSSProperties["color"];
};

const Frame1: FunctionComponent<Frame1Type> = ({
  className = "",
  users,
  prop,
  frameDivFlex,
  frameDivPosition,
  frameDivBorderRadius,
  frameDivBackgroundColor,
  frameDivPadding,
  frameDivGap,
  frameDivAlignSelf,
  frameDivBackdropFilter,
  frameDivMinWidth,
  usersColor,
  divFontSize,
  divColor,
}) => {
  const frameDivStyle: CSSProperties = useMemo(() => {
    return {
      flex: frameDivFlex,
      position: frameDivPosition,
      borderRadius: frameDivBorderRadius,
      backgroundColor: frameDivBackgroundColor,
      padding: frameDivPadding,
      gap: frameDivGap,
      alignSelf: frameDivAlignSelf,
      backdropFilter: frameDivBackdropFilter,
      minWidth: frameDivMinWidth,
    };
  }, [
    frameDivFlex,
    frameDivPosition,
    frameDivBorderRadius,
    frameDivBackgroundColor,
    frameDivPadding,
    frameDivGap,
    frameDivAlignSelf,
    frameDivBackdropFilter,
    frameDivMinWidth,
  ]);

  const usersStyle: CSSProperties = useMemo(() => {
    return {
      color: usersColor,
    };
  }, [usersColor]);

  const divStyle: CSSProperties = useMemo(() => {
    return {
      fontSize: divFontSize,
      color: divColor,
    };
  }, [divFontSize, divColor]);

  return (
    <div
      className={`flex-1 w-full relative rounded-3xl bg-primary max-w-full flex flex-col items-center justify-center p-8 box-border gap-[9px] text-center text-base text-layer-1 font-gilroy-medium ${className}`}
      style={frameDivStyle}
    >
      <div
        className="self-stretch relative tracking-[-0.03em] leading-[120.41%]"
        style={usersStyle}
      >
        {users}
      </div>
      <div
        className="self-stretch relative text-[56px] tracking-[-0.03em] leading-[100%] font-gilroy-semibold text-bg"
        style={divStyle}
      >
        {prop}
      </div>
    </div>
  );
};

export default Frame1;
