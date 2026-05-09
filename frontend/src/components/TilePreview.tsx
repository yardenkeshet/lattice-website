import { Button } from "./ui/button";


type TilePreviewProps = {
  name: string;
  imageSrc?: string;
  onSelect?: () => void;
};

const TilePreview = ({ name, imageSrc, onSelect }: TilePreviewProps) => {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200">
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

        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-800">
            {name}
          </div>
        </div>
      </div>

      <Button type="button" size="sm" onClick={onSelect}>
        Select
      </Button>
    </div>
  )
}
export default TilePreview;