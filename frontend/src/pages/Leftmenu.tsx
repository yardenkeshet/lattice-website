import React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
  useFileUpload,
} from "@/components/ui/file-upload";
import { Separator } from "@/components/ui/separator";
import TilePreview from "@/components/TilePreview";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { LatticeParams } from "./Tool";

const ToolIgsUploadList: React.FC = () => {
  const files = useFileUpload((state) => Array.from(state.files.keys()));

  return (
    <FileUploadList className="mt-3">
      {files.map((file) => (
        <FileUploadItem key={`${file.name}-${file.lastModified}`} value={file}>
          <FileUploadItemPreview />
          <FileUploadItemMetadata />
          <FileUploadItemDelete asChild>
            <Button type="button" variant="ghost" size="sm">
              Remove
            </Button>
          </FileUploadItemDelete>
        </FileUploadItem>
      ))}
    </FileUploadList>
  );
};

type Props = {
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  cameraMode: "PERSPECTIVE" | "ORTHO";
  setCameraMode: (mode: "PERSPECTIVE" | "ORTHO") => void;
  params: LatticeParams;
  onInputChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  onTileCalculate: () => void;
  onModelCalculate: () => void;
  isCalculating: boolean;
  status: string;
  elapsedTime: number;
  onIgsFilesSelected: (files: File[]) => void;
};

const LeftMenu: React.FC<Props> = (props) => {
  const {
    isPanelOpen,
    setIsPanelOpen,
    cameraMode,
    setCameraMode,
    params,
    onInputChange,
    onTileCalculate,
    onModelCalculate,
    isCalculating,
    status,
    elapsedTime,
    onIgsFilesSelected,
  } = props;

  if (!isPanelOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className="top-24 left-4 z-50"
        onClick={() => setIsPanelOpen(true)}
      >
        ☰
      </Button>
    );
  }

  return (
    <Card
      id="ui-panel"
      className="p-0 m-5 w-xl"
    >
      <CardHeader >
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="truncate">Lattice Maker</CardTitle>
          <button id="close-ui-btn" onClick={() => setIsPanelOpen(false)}>
            ✕
          </button>
        </div>
      </CardHeader>

      <CardContent className="py-4 flex flex-col gap-5 w-l">
        <div className="">
          <h1>Lattice Tile</h1>
          <TilePreview name={params.tileType} />
          {/* <select
                id="tileType"
                value={params.tileType}
                onChange={onInputChange}
              >
                <option value="diagonal">DIAGONAL</option>
                <option value="cross">CROSS</option>
                <option value="cross_diagonal">CROSS_DIAGONAL</option>
                
              </select> */}
        </div>

        <div className="">
          <label>Num Tiles</label>
          <div className="flex flex-row items-center gap-5">
            <label htmlFor="nt1">X:</label>
            <Input
              name="x"
              type="number"
              id="nt1"
              value={params.nt1}
              onChange={onInputChange}>

            </Input>
            <label htmlFor="nt2">Y:</label>
            <Input
              type="number"
              id="nt2"
              value={params.nt2}
              onChange={onInputChange}
            />
            <label htmlFor="nt3">Z:</label>
            <Input
              type="number"
              id="nt3"
              value={params.nt3}
              onChange={onInputChange}
              step="0.1"
            />
          </div>
        </div>

        <div className="flex flex-col">
          <div className="control-group flex flex-row">
            <label htmlFor="g1">Grading Start:</label>
            <Input
              type="number"
              id="g1"
              value={params.g1}
              onChange={onInputChange}
              step="0.01"
            />
            <label htmlFor="g2">Grading End:</label>
            <Input
              type="number"
              id="g2"
              value={params.g2}
              onChange={onInputChange}
              step="0.01"
            />
          </div>
        </div>

        <div className="control-group">
          <h1>Model Input</h1>
          <FileUpload
            accept=".igs,.iges"
            maxFiles={1}
            onValueChange={onIgsFilesSelected}
          >
            <FileUploadDropzone className="bg-white/5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="text-sm text-slate-200">
                  Drop your IGS file here
                </div>
                <FileUploadTrigger asChild>
                  <Button type="button" variant="secondary">
                    Browse files
                  </Button>
                </FileUploadTrigger>
              </div>
            </FileUploadDropzone>
            <ToolIgsUploadList />
          </FileUpload>
        </div>
        <div className="control-group">
          <label>Camera Mode</label>
          <button
            className="mode-toggle-btn"
            onClick={() =>
              setCameraMode(
                cameraMode === "PERSPECTIVE" ? "ORTHO" : "PERSPECTIVE",
              )
            }
          >
            📷 {cameraMode}
          </button>
        </div>
        <Button
          variant="outline"
          id="calculate"
          className={isCalculating ? "btn-disabled" : ""}
          onClick={onModelCalculate}
        >
          {isCalculating ? "Processing..." : "Calculate & Send"}
        </Button>

        <div className="status-bar">
          <strong>Status:</strong> <span>{status}</span>
        </div>

        {isCalculating && (
          <div id="calc-activity">
            <div className="spinner"></div>
            <div className="timer">
              <span>Calculating… </span>
              <span>{elapsedTime}</span>s
            </div>
          </div>
        )}
      </CardContent>
    </Card>

  );
};

export default LeftMenu;

