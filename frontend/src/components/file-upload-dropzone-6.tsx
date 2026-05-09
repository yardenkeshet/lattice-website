"use client";

import { Upload, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
} from "@/components/ui/file-upload";

export const title = "Large Dropzone";

const Example = () => {
  const [files, setFiles] = React.useState<File[]>([]);

  return (
    <FileUpload
      maxFiles={10}
      maxSize={50 * 1024 * 1024}
      className="w-full max-w-lg"
      value={files}
      onValueChange={setFiles}
      multiple
    >
      <FileUploadDropzone className="min-h-[240px]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-2xl bg-muted p-6">
            <Upload className="size-12 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Upload your files</h3>
            <p className="text-muted-foreground">
              Drag and drop your files here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Up to 10 files, 50MB each
            </p>
          </div>
        </div>
      </FileUploadDropzone>
      <FileUploadList>
        {files.map((file, index) => (
          <FileUploadItem key={index} value={file}>
            <FileUploadItemPreview />
            <FileUploadItemMetadata />
            <FileUploadItemDelete render={<Button variant="ghost" size="icon" className="size-7" />}><X className="size-4" /></FileUploadItemDelete>
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
};

export default Example;
