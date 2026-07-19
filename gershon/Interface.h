#ifndef MSDLL_INTERFACE_H
#define MSDLL_INTERFACE_H

typedef enum {
    MSDLL_TILE_CROSS,
    MSDLL_TILE_DIAGONAL,
    MSDLL_TILE_CROSS_DIAGONAL
} MSDLLTileType;

void MSDLLSetProgressReportFuncs(
			       IritMiscProgressReportInitFuncType InitFunc,
			       IritMiscProgressReportUpdateFuncType UpdateFunc,
			       IritMiscProgressReportDoneFuncType DoneFunc,
			       void *CBData);
const char *MSDLLGetTile(MSDLLTileType TileType,
			 IrtRType *Params,
			 IrtRType *Graded,
			 const char *MSSTLFile);
const char *MSDLLMSFromRuling(const char *Srf1IgsFile,
			      const char *Srf2IgsFile,
			      int NumTiles[3],
			      double Graded[2],
			      MSDLLTileType TileType,
			      double *TileParams,
			      const char *MSIGSFile,
			      const char *MSTLSFile);
const char *MSDLLMSFromExtrusion(const char *SrfIgsFile,
				 double ExtrudeLength,
				 int NumTiles[3],
				 double Graded[2],
				 MSDLLTileType TileType,
				 double *TileParams,
				 const char *MSIGSFile,
				 const char *MSTLSFile);
const char *MSDLLMSFromRevolution(const char *SrfIgsFile,
				  int NumTiles[3],
				  double Graded[2],
				  MSDLLTileType TileType,
				  double *TileParams,
				  const char *MSIGSFile,
				  const char *MSTLSFile);
const char *MSDLLIGES2STL(const char *SrfIgsFile,
			  const char *SrfSTLFile);
const char *MSDLLSetPolyTolerance(int Tolerance);

#endif /* MSDLL_INTERFACE_H */
