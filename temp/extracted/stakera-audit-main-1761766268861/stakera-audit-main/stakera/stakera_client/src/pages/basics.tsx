import type { NextPage } from "next";
import Head from "next/head";
import { BasicsView } from "../views";

const Basics: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Stakera</title>
        <meta name="description" content="Stakera" />
      </Head>
      <BasicsView />
    </div>
  );
};

export default Basics;
