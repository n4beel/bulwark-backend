import type { NextPage } from "next";
import Head from "next/head";
import { HomeView } from "../views";

const Home: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Stakera</title>
        <meta name="description" content="Stakera" />
      </Head>
      <HomeView />
    </div>
  );
};

export default Home;
