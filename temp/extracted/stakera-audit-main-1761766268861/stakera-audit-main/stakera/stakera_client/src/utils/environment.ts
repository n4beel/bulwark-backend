export const isDev = process.env.NODE_ENV === "development";

export const isDebug = process.env.DEBUG === "true" && isDev;
