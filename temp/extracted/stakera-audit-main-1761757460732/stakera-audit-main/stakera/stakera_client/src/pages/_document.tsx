import Document, {
  DocumentContext,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);

    return initialProps;
  }

  render() {
    return (
      <Html>
        <Head>
          <link rel="shortcut icon" href="/group-1.svg" />
          <script defer src="charting_library/charting_library.standalone.js" />
          <script defer src="datafeeds/udf/dist/bundle.js" />
          <script
            defer
            src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.5.4/socket.io.js"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
