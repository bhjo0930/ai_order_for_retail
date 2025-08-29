import type { NextConfig } from "next";
import { withNextWebSocket } from "next-ws";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextWebSocket(nextConfig);
