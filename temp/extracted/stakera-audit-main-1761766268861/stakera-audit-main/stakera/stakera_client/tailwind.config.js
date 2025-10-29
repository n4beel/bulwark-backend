/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "layer-1": "#193a31",
        "neutral-06": "#fff",
        gray: {
          100: "#091613",
          200: "rgba(255, 255, 255, 0.5)",
          300: "rgba(255, 255, 255, 0.75)",
          400: "rgba(255, 255, 255, 0.15)",
          500: "rgba(255, 255, 255, 0.1)",
        },
        bg: "#0c1e1b",
        mediumslateblue: "rgba(115, 99, 243, 0.5)",
        secondary: "#7363f3",
        mediumspringgreen: {
          50: "rgba(111, 255, 144, 0.06)",
          100: "rgba(111, 255, 144, 0.12)",
          200: "rgba(111, 255, 144, 0.5)",
        },
        primary: "#6fff90",
        darkslategray: {
          100: "#255146",
          200: "rgba(26, 62, 53, 0.36)",
        },
      },
      spacing: {},
      fontFamily: {
        "gilroy-regular": "Gilroy-Regular",
        "gilroy-bold": "Gilroy-Bold",
        "gilroy-medium": "Gilroy-Medium",
        "gilroy-semibold": "Gilroy-SemiBold",
      },
      borderRadius: {
        "981xl": "1000px",
      },
    },
    fontSize: {
      sm: "14px",
      "mini-7": "14.7px",
      base: "16px",
      mini: "15px",
      xl: "20px",
      "3xl": "22px",
      mid: "17px",
      "13xl": "32px",
      "35xl": "54px",
      lg: "18px",
      "5xl": "24px",
      "29xl": "48px",
      "lg-8": "18.8px",
      inherit: "inherit",
    },
  },
  corePlugins: {
    preflight: false,
  },
};
