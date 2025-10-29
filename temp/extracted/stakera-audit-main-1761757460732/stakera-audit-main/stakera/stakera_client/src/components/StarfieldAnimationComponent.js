// components/StarfieldAnimationComponent.js
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import StarfieldAnimation from "react-starfield-animation";

const StarfieldAnimationComponent = () => {
  useEffect(() => {
    // Create a new div that wraps the component
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);

    ReactDOM.render(
      <StarfieldAnimation
        numParticles={800}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          margin: "auto",
          width: "100%",
          height: "100%",
          zIndex: -1,
        }}
      />,
      wrapper
    );

    // Cleanup function to remove the appended child
    return () => {
      document.body.removeChild(wrapper);
    };
  }, []);

  // This component does not render anything itself
  return null;
};

export default StarfieldAnimationComponent;
