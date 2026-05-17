
typedef enum {
    MSDLL_TILE_CROSS,
    MSDLL_TILE_DIAGONAL,
    MSDLL_TILE_CROSS_DIAGONAL
} MSDLLTileType;

typedef  double IrtRType;

const char *MSDLLGetTile(MSDLLTileType Tile,
			 IrtRType *Params,
			 IrtRType *Graded,
			 const char *MSSTLFile);

const char *MSDLLMSFromRuling(const char *Srf1IgsFile,
			      const char *Srf2IgsFile,
			      int NumTiles[3],
			      double Graded[2],
			      MSDLLTileType Tile,
			      double *TileParams,
			      const char *MSIGSFilee,
			      const char *MSTLSFile);
const char *MSDLLMSFromExtrusion(const char *SrfIgsFile,
				 double ExtrudeLength,
				 int NumTiles[3],
				 double Graded[2],
				 MSDLLTileType Tile,
				 double *TileParams,
				 const char *MSIGSFile,
				 const char *MSTLSFile);
const char * MSDLLMSFromRevolution(const char *SrfIgsFile,
				   int NumTiles[3],
				   double Graded[2],
				   MSDLLTileType Tile,
				   double *TileParams,
				   const char *MSIGSFile,
				   const char *MSTLSFile);
