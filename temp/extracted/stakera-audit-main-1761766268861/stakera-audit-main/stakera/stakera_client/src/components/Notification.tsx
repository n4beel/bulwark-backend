import { useEffect, useState } from "react";
import {
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/outline";
import { XIcon } from "@heroicons/react/solid";
import useNotificationStore from "../stores/useNotificationStore";
import { useConnection } from "@solana/wallet-adapter-react";
import { useMediaQuery } from "react-responsive";
import { useNetworkConfiguration } from "contexts/NetworkConfigurationProvider";

const NotificationList = () => {
  const { notifications, set: setNotificationStore } = useNotificationStore(
    (s) => s
  );

  const isMobile = useMediaQuery({ query: "(max-width: 767px)" });

  const handleHideNotification = (id) => {
    setNotificationStore((state) => {
      state.notifications = state.notifications.filter(
        (notification) => notification.id !== id
      );
    });
  };

  return (
    <div
      className={`z-20 fixed ${
        isMobile
          ? "bottom-20 inset-x-0 justify-center items-center "
          : "bottom-2 left-4 "
      } flex flex-col items-end px-4 py-6 pointer-events-none sm:p-6`}
    >
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          id={notification.id}
          type={notification.type}
          message={notification.message}
          description={notification.description}
          txid={notification.txid}
          onHide={() => handleHideNotification(notification.id)}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
};

const Notification = ({
  id,
  type,
  message,
  description,
  txid,
  onHide,
  isMobile,
}) => {
  const { connection } = useConnection();
  const { networkConfiguration } = useNetworkConfiguration();

  const [exit, setExit] = useState(false);

  useEffect(() => {
    setTimeout(() => setExit(true), 7000);
    setTimeout(() => onHide(id), 7300); // 300ms longer to match the fade-out animation

    return () => {};
  }, [onHide, id]);

  const gradientBackgrounds = {
    success: "linear-gradient(to right, #111111, #2d5547)",
    info: "linear-gradient(to right, #111111, #2e2e2e)",
    error: "linear-gradient(to right, #111111, #3c2121)",
  };

  const notificationClasses = `max-w-sm ${
    isMobile ? "w-full " : "w-[320px] h-auto "
  } bg-bkg-1 rounded-md mt-2 pointer-events-auto ring-1 ring-black ring-opacity-5  mx-2 mb-2 overflow-hidden font-poppins ${
    exit ? "notification-exit" : "notification-enter"
  }`;

  const progressColor = {
    success: "bg-primary",
    info: "bg-[#484848]",
    error: "bg-[#ff4c4c]",
  };

  const className = progressColor[type] || "default-class";

  return (
    <div className={notificationClasses}>
      <div
        className={`rounded-md p-[1px]`}
        style={{ background: gradientBackgrounds[type] }}
      >
        <div
          className={`pt-1 rounded-t-md ${className}`}
          style={{
            animation: `progressBar 7s linear`,
            height: "2px",
          }}
        />
        <div
          className={`text-white p-2.5 rounded-b-md bg-[#00000085] bg-opacity-90 flex items-center`}
        >
          {/* Icon and message layout */}
          <div className={`flex-shrink-0`}>
            {type === "success" && (
              <CheckCircleIcon className={`h-7 w-7 mr-1 text-primary`} />
            )}
            {type === "info" && (
              <InformationCircleIcon className={`h-7 w-7 mr-1 text-red`} />
            )}
            {type === "error" && (
              <XCircleIcon className={`h-7 w-7 mr-1 text-[#ff4c4c]`} />
            )}
          </div>
          <div className={`ml-2 flex-1`}>
            <div className={`Gilroy-Regular text-[1rem]`}>{message}</div>
            {description && (
              <p className={`Gilroy-Regular mt-0.5 text-[0.8rem]`}>
                {description}
              </p>
            )}
            {txid && (
              <div className="flex flex-row">
                <a
                  href={`https://solscan.io/tx/${txid}?cluster=${networkConfiguration}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-row link link-accent text-emerald-200"
                >
                  {/* Transaction link layout */}
                </a>
              </div>
            )}
          </div>
          <div className={`flex-shrink-0 self-start flex`}>
            <button
              onClick={() => onHide(id)}
              className={`bg-bkg-2 default-transition rounded-md inline-flex text-fgd-3 hover:text-fgd-4 focus:outline-none`}
            >
              <span className={`sr-only`}>Close</span>
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationList;
