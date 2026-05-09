import React from "react";
import type { BufferGeometry } from "three";

import ThreeViewer from "../components/Viewer";

type Props = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  geometry: BufferGeometry | null;
  // stlGetUrl: string | null;
};

const Viewer: React.FC<Props> = ({ canvasRef, geometry }) => {
  return (
    <>
      <ThreeViewer geometry={geometry}  />
    </>
  );
};

export default Viewer;

