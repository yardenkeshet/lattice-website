import React from "react";
import { Sheet, SheetContent } from "../components/ui/sheet";
import { Card } from "@/components/ui/card";
import { ImagesSrcs, type LatticeParams } from "./Tool";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Viewer from "@/pages/Viewer";
import type { BufferGeometry } from "three";


type Props = {
  params: LatticeParams;
  tileGeometry: BufferGeometry | null;
  onTileCalculate: () => void;
  onInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

const RightMenu: React.FC<Props> = (props) => {
  const {
    params,
    tileGeometry,
    onTileCalculate,
    onInputChange,
    canvasRef
  } = props;

  return (
    <Card
      id="ui-panel"
      className="p-2 m-5 w-xl right-0 top-0"
    >
      <div className=" top-0 right-0  control-group">
        <div className="flex flex-row justify-between">
          <h1>Lattice Tile</h1>
          <Button>X</Button>

        </div>
        <Viewer geometry={tileGeometry} canvasRef={canvasRef}></Viewer>
        <div className="h-20 w-40 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
          <img
            src={""}
            alt={`${name} preview`}
            className="h-full w-full object-cover"
          />
        </div>
        <h1>Tile Type:</h1>
        <div className="flex flex-wrap gap-4">
          {ImagesSrcs.map((imageSrc) => {
            return <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={`${name} preview`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold tracking-wider text-slate-400">
                  PREVIEW
                </div>
              )}
            </div>
          })}
        </div>
        <div className="flex flex-col">
          <label htmlFor="p1">Center size:</label>
          <Input
            type="number"
            id="p1"
            value={params.p1}
            onChange={onInputChange}
            step="0.01"
          />

          <label htmlFor="p2">End-arm Size:</label>
          <Input
            type="number"
            id="p2"
            value={params.p2}
            onChange={onInputChange}
            step="0.01"
          />

          <label htmlFor="p3">Smoothing of arms:</label>
          <Input
            type="number"
            id="p3"
            value={params.p3}
            onChange={onInputChange}
            step="0.01"
          />
        </div>
      </div>
      <Button onClick={onTileCalculate}>Calculate Tile!</Button>
    </Card>
  );
};

export default RightMenu;

