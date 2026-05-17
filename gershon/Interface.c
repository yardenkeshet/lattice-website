/*****************************************************************************
*   "Irit" - the 3d (not only polygonal) solid modeler.			     *
*									     *
* Written by:  Gershon Elber				Ver 0.2, Nov 2025    *
******************************************************************************
* (C) Gershon Elber, Technion, Israel Institute	of Technology		     *
******************************************************************************
*   Module to provide a lattice generation interface to python.		     *
*****************************************************************************/

#include <stdio.h>
#include <math.h>
#include "inc_irit/geom_lib.h"
#include "inc_irit/allocate.h"
#include "inc_irit/iritprsr.h"
#include "inc_irit/triv_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/user_lib.h"
#include "interface.h"

#define IRIT_PARA_NUM_THREADS	16

static char GlblErrStr[IRIT_LINE_LEN];

static int MSDLLVerifyInput(const char *Srf1IgsFile,
			    const char *Srf2IgsFile,
			    IPObjectStruct **Srf1,
			    IPObjectStruct **Srf2,
			    int NumTiles[3],
			    double Graded[2],
			    MSDLLTileType Tile,
			    char ** const ErrStr);
static IPObjectStruct *MSDLLGetTileAux(MSDLLTileType Tile,
				       IrtRType *Params,
				       IrtRType *Graded,
				       char ** const ErrStr);

/*****************************************************************************
* DESCRIPTION:                                                               *
*   Verifies the input data.                                                 *
*                                                                            *
* PARAMETERS:                                                                *
*   Srf1IgsFile, Srf2IgsFile:  Read them if exists and fine.                 *
*   NumTiles:                  Verify the lattice sizes make sense.          *
*   Graded:                    Verify graded domains.                        *
*   Tile:                      Verify Tile type.                             *
*                                                                            *
* RETURN VALUE:                                                              *
*   int:     TRUE if verified.  Otherwise an error (in ErrStr).              *
*****************************************************************************/
static int MSDLLVerifyInput(const char *Srf1IgsFile,
			    const char *Srf2IgsFile,
			    IPObjectStruct **Srf1,
			    IPObjectStruct **Srf2,
			    int NumTiles[3],
			    double Graded[2],
			    MSDLLTileType Tile,
			    char ** const ErrStr)
{
    int i;
    IritPrsrIgesLoadDfltFileParamsStruct
        Params = IritPrsrIgesLoadDfltParams;

    IritPrsrSetPolyListCirc(TRUE);
    IritMiscSetIritParallelExec(IRIT_PARA_NUM_THREADS);

    *ErrStr = NULL;

    if (Tile < MSDLL_TILE_CROSS || Tile > MSDLL_TILE_CROSS_DIAGONAL) {
        *ErrStr = "Tile type requested is not in range.";
	return FALSE;
    }

    for (i = 0; i < 3; i++) {
        if (NumTiles[i] < 1 || NumTiles[i] > 10) {
	    *ErrStr = "Number of tiles is not in the valid range.";
	    return FALSE;
	}
    }

    for (i = 0; i < 2; i++) {
        if (Graded[i] < 0.1 || Graded[i] > 2.5) {
	    *ErrStr = "Grading information is not in the valid range.";
	    return FALSE;
	}
    }

    if (((*Srf1) = IritPrsrIgesLoadFile(Srf1IgsFile, &Params)) == NULL) {
	*ErrStr = "Failed to read first input file.";
	return FALSE;
    }
    else if (!IP_IS_SRF_OBJ(*Srf1) ||
	     CAGD_IS_RATIONAL_SRF((*Srf1) -> U.Srfs) ||
	     (!CAGD_IS_BEZIER_SRF((*Srf1) -> U.Srfs) &&
	      !IritCagdBspSrfHasBezierKVs((*Srf1) -> U.Srfs))) {
        *ErrStr = "First input file is not holding a polynomial Bezier surface.";
	return FALSE;
    }

    if (Srf2IgsFile != NULL) {
        if (((*Srf2) = IritPrsrIgesLoadFile(Srf2IgsFile, &Params)) == NULL) {
	    IritPrsrFreeObject(*Srf1);
	    *ErrStr = "Failed to read second input file.";
	    return FALSE;
	}
	else if (!IP_IS_SRF_OBJ(*Srf2) ||
		 CAGD_IS_RATIONAL_SRF((*Srf2) -> U.Srfs) ||
		 (!CAGD_IS_BEZIER_SRF((*Srf2) -> U.Srfs) &&
		  !IritCagdBspSrfHasBezierKVs((*Srf2) -> U.Srfs))) {
	    IritPrsrFreeObject(*Srf1);
	    *ErrStr = "Second input file is not holding a polynomial Bezier surface.";
	    return FALSE;
	}
    }

    return TRUE;
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   Creates and return the desired tile.                                     *
*                                                                            *
* PARAMETERS:                                                                *
*   Tile:     Tile type to create.                                           *
*   Params:   For Cross tile: (Outer Radius, Inner Radius)                   *
*             For Diagonal tiles: (Center Size, Corner Size, Smooth Factor). *
*             For Cross-Diagonal tile: (Cross Radius, Diagonal Radius)       *
*   Graded:   We be used to create a graded lattice in theruled direction    *
*             (variable arm thicknesses).				     *
*                                                                            *
* RETURN VALUE:                                                              *
*   IPObjectStruct *:                                                        *
*****************************************************************************/
static IPObjectStruct *MSDLLGetTileAux(MSDLLTileType Tile,
				       IrtRType *Params,
				       IrtRType *Graded,
				       char ** const ErrStr)
{
    int i;
    IPObjectStruct
        *TileObj = NULL;

    *ErrStr = NULL;

    switch (Tile) {
        default:
        case MSDLL_TILE_CROSS:
	{
	    IrtRType OuterRadii[6], InnerRadii[6];

	    for (i = 0; i < 6; i++) {
	        OuterRadii[i] = Params[0];
		InnerRadii[i] = Params[1];
	    }

	    TileObj = IritUserMicro3DCrossTile2(TRUE, OuterRadii,
						Params[1] == 0.0 ?
						    NULL :
						    InnerRadii,
						2 * Params[0], ErrStr);
	    break;
	}
	case MSDLL_TILE_DIAGONAL:
	{
	    IrtRType CrnrSizes[8],
	        CrnrVertScl[2] = { 1.0, 1.0 };

	    for (i = 0; i < 8; i++)
	        CrnrSizes[i] = Params[1];

	    TileObj = IritUserMicroDiagTile1(Params[0], 1.0, CrnrSizes,
					     CrnrVertScl, NULL, FALSE,
					     Params[2], NULL, ErrStr);
	    break;
	}
        case MSDLL_TILE_CROSS_DIAGONAL:
	{
	    IrtRType CrossRadii[6], DiagRadii[8];

	    for (i = 0; i < 6; i++)
	        CrossRadii[i] = Params[0];
	    for (i = 0; i < 8; i++)
		DiagRadii[i] = Params[1];

	    TileObj = IritUserMicro3DCrossDiagTile(TRUE, CrossRadii,
						   DiagRadii, 2 * Params[0],
						   ErrStr);
	    break;
	}
    }

    return TileObj;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Creates and save the desired tile.                                       M
*                                                                            *
* PARAMETERS:                                                                M
*   Tile:     Tile type to create.                                           M
*   Params:   For Cross tile: (Outer Radius, Inner Radius)                   M
*             For Diagonal tiles: (Center Size, Corner Size, Smooth Factor). M
*             For Cross-Diagonal tile: (Cross Radius, Diagonal Radius)       M
*   Graded:   We be used to create a graded lattice in theruled direction    M
*             (variable arm thicknesses).				     M
*   MSSTLFile: Name of STL file to save the tile in.	 	             M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:   NULL if succesful. An error string if not.               M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLGetTile                                                             M
*****************************************************************************/
const char *MSDLLGetTile(MSDLLTileType Tile,
			 IrtRType *Params,
			 IrtRType *Graded,
			 const char *MSSTLFile)
{
    char *ErrStr;
    IrtHmgnMatType UnitMat;
    IPObjectStruct *TileObj;

    IritPrsrSetPolyListCirc(TRUE);
    IritMiscSetIritParallelExec(IRIT_PARA_NUM_THREADS);

    if ((TileObj = MSDLLGetTileAux(Tile, Params, Graded, &ErrStr)) == NULL ||
	ErrStr != NULL) {
        return ErrStr;
    }

    IritMiscMatGenUnitMat(UnitMat);
    IritPrsrSTLSaveFile(TileObj, UnitMat, MSSTLFile, NULL);

    return NULL;
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   Constructs the lattice and save it in the designated files.              *
*                                                                            *
* PARAMETERS:                                                                *
*   TV:         The macro-shape in whcih to build the microstructure.        *
*   TileObj:    The tile to use for the lattice.  Should be NULL if Graded.  *
*   NumTiles:   In (u, v, w) parameteric directions.                         *
*   Graded:     If tiles should be geometrically graded in the lattice.      *
*               hold the minimal and maximal scales to use in the grading    *
*               of the first parameter in the third (non surface) axis.      *
*   Tile:       Tile type we are employing here.                             *
*   TileParams: Two or three numeric parameters to control tiles, depending  *
*               on Tile type.						     *
*                                                                            *
* RETURN VALUE:                                                              *
*   IPObjectStruct *:                                                        *
*****************************************************************************/
static IPObjectStruct *MSDLLGenMS(const TrivTVStruct *TV,
				  IPObjectStruct *TileObj,
				  int NumTiles[3],
				  double Graded[2],
				  MSDLLTileType Tile,
				  double *TileParams)
{
    int i;
    IPObjectStruct *MS, *MSMerged, *MSSrfs;
    UserMicroParamStruct MSParam;
    UserMicroRegularParamStruct *MSRegularParam;

    /* Create the structure to be passed to the call back function. */
    IRIT_ZAP_MEM(&MSParam, sizeof(UserMicroParamStruct));
    MSParam.TilingType = USER_MICRO_TILE_REGULAR;
    MSParam.DeformMV = IritMvarCnvrtTVToMV(TV);
    MSParam.ApproxLowOrder = 4;

    MSRegularParam = &MSParam.U.RegularParam;
    MSRegularParam -> Tile = IritUserMicroParseTileFromObj(TileObj);
    MSRegularParam -> TilingStepMode = TRUE;

    MSRegularParam -> TilingSteps[0].TilesPerIntervals = 
			      (CagdRType *) IritMalloc(sizeof(CagdRType) * 2);
    MSRegularParam -> TilingSteps[0].Len = 1;
    MSRegularParam -> TilingSteps[0].TilesPerIntervals[0] = NumTiles[0];

    MSRegularParam -> TilingSteps[1].TilesPerIntervals = 
			      (CagdRType *) IritMalloc(sizeof(CagdRType) * 2);
    MSRegularParam -> TilingSteps[1].Len = 1;
    MSRegularParam -> TilingSteps[1].TilesPerIntervals[0] = NumTiles[1];

    MSRegularParam -> TilingSteps[2].TilesPerIntervals = 
			      (CagdRType *) IritMalloc(sizeof(CagdRType) * 2);
    MSRegularParam -> TilingSteps[2].Len = 1;
    MSRegularParam -> TilingSteps[2].TilesPerIntervals[0] = NumTiles[2];

    MS = IritUserMicroStructComposition(&MSParam);/* Cnstrct microstructure.*/
    IritMvarMVFree(MSParam.DeformMV);

    for (i = 0; i < 3; ++i)
	IritFree(MSRegularParam -> TilingSteps[i].TilesPerIntervals);

    MSMerged = IritPrsrFlattenForrest2(MS, FALSE);
    IritPrsrFreeObject(MS);
    MSSrfs = IritPrsrCoerceObjectTo(MSMerged, IP_OBJ_SURFACE);
    IritPrsrFreeObject(MSMerged);

    return MSSrfs;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Builds a microstructure lattice in the ruled volume between surface      M
* Srf1IgsFile and surface Srf2IgsFile, as IGES files.  Lattice will have     M
* (NumTiles[0], NumTiles[1]) Tile tiles in the surfaces and NumTiles[2] in   M
* the ruling direction.  Result will be saved in MSIGSFile and MSSTLFile,    M
* for IGES and STL files respectively.                                       M
*                                                                            *
* PARAMETERS:                                                                M
*   Srf1IgsFile, Srf2IgsFile:  The two surfaces, given as IGES files, to     M
*              rule a volume between, for the microstructure.                M
*   NumTiles:  Number of tiles to place in the lattice, in the three         M
*              parametric directions of the volume.			     M
*   Graded:    We be used to create a graded lattice in theruled direction   M
*              (variable arm thicknesses).				     M
*   Tile:      Type of tile to use.                                          M
*   TileParams: Two or three numeric parameters to control tiles, depending  M
*              on Tile type.						     M
*   MSIGSFile, MSSTLFile:  Names of output file to save the lattice in.      M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:   NULL if succesful. An error string if not.               M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLMSFromRuling                                                        M
*****************************************************************************/
const char *MSDLLMSFromRuling(const char *Srf1IgsFile,
			      const char *Srf2IgsFile,
			      int NumTiles[3],
			      double Graded[2],
			      MSDLLTileType Tile,
			      double *TileParams,
			      const char *MSIGSFile,
			      const char *MSSTLFile)
{
    char * const ErrStr;
    IrtHmgnMatType UnitMat;
    TrivTVStruct *TV;
    IPObjectStruct *MS, *TileObj, *Srf1, *Srf2;
	     
    if (!MSDLLVerifyInput(Srf1IgsFile, Srf2IgsFile, &Srf1, &Srf2,
			  NumTiles, Graded, Tile, (char ** const) &ErrStr))
        return ErrStr;

    if ((TileObj = MSDLLGetTileAux(Tile, TileParams, Graded,
				   (char ** const) &ErrStr)) == NULL ||
	ErrStr != NULL) {
        sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
        return GlblErrStr;
    }

    TV = IritTrivRuledTV(Srf1 -> U.Srfs, Srf2 -> U.Srfs, 2, 2);

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, Tile, TileParams);
    IritTrivTVFree(TV);
    IritPrsrFreeObject(TileObj);

    IritMiscMatGenUnitMat(UnitMat);
    IritPrsrIgesSaveFile(MS, UnitMat, MSIGSFile, FALSE);
    IritPrsrSTLSaveFile(MS, UnitMat, MSSTLFile, NULL);

    IritPrsrFreeObject(MS);

    return NULL;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Builds a microstructure lattice in the extruded volume from surface      M
* SrfIgsFile, as an IGES file.  Extrusion is in +Z ExtrudeLength amount.     M
* Lattice will have (NumTiles[0], NumTiles[1]) Tile tiles in the surfaces    M
* and NumTiles[2] in the extrusion direction.  Result will be saved in       M
* MSIGSFile and MSSTLFile, for IGES and STL files respectively.              M
*                                                                            *
* PARAMETERS:                                                                M
*   SrfIgsFile:  The surface, given as IGES files, to extrude a volume from, M
*              for the microstructure.				             M
*   ExtrudeLength:  Amount to extrude SrfIgsFile in the +Z direction.        M
*   NumTiles:  Number of tiles to place in the lattice, in the three         M
*              parametric directions of the volume.			     M
*   Graded:    We be used to create a graded lattice in extruded direction   M
*              (variable arm thicknesses).				     M
*   Tile:      Type of tile to use.                                          M
*   TileParams: Two or three numeric parameters to control tiles, depending  M
*              on Tile type.						     M
*   MSIGSFile, MSSTLFile:  Names of output file to save the lattice in.      M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:   NULL if succesful. An error string if not.               M
*                                                                            *
* SEE ALSO:                                                                  M
*                                                                            M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLMSFromRuling                                                        M
*****************************************************************************/
const char *MSDLLMSFromExtrusion(const char *SrfIgsFile,
				 double ExtrudeLength,
				 int NumTiles[3],
				 double Graded[2],
				 MSDLLTileType Tile,
				 double *TileParams,
				 const char *MSIGSFile,
				 const char *MSSTLFile)
{
    char * const ErrStr;
    CagdVecStruct ZVec;
    IrtHmgnMatType UnitMat;
    TrivTVStruct *TV;
    IPObjectStruct *MS, *TileObj, *Srf;
	     
    if (!MSDLLVerifyInput(SrfIgsFile, NULL, &Srf, NULL,
			  NumTiles, Graded, Tile, (char ** const) &ErrStr))
        return ErrStr;

    if (ExtrudeLength <= 0.0 || ExtrudeLength > 100.0) {
        return "Extrusion length is not in the valid range.";
    }

    if ((TileObj = MSDLLGetTileAux(Tile, TileParams, Graded,
				   (char ** const) &ErrStr)) == NULL ||
	ErrStr != NULL) {
        sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
        return GlblErrStr;
    }

    IRIT_ZAP_MEM(&ZVec, sizeof(CagdVecStruct));
    ZVec.Vec[2] = ExtrudeLength;
    TV = IritTrivExtrudeTV(Srf -> U.Srfs, &ZVec);

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, Tile, TileParams);
    IritTrivTVFree(TV);
    IritPrsrFreeObject(TileObj);

    IritMiscMatGenUnitMat(UnitMat);
    IritPrsrIgesSaveFile(MS, UnitMat, MSIGSFile, FALSE);
    IritPrsrSTLSaveFile(MS, UnitMat, MSSTLFile, NULL);

    IritPrsrFreeObject(MS);

    return NULL;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Builds a microstructure lattice in the revolution volume from surface    M
* SrfIgsFile, as an IGES file.  Extrusion is in +Z ExtrudeLength amount.     M
* Lattice will have (NumTiles[0], NumTiles[1]) Tile tiles in the surfaces    M
* and NumTiles[2] in the extrusion direction.  Result will be saved in       M
* MSIGSFile and MSSTLFile, for IGES and STL files respectively.              M
*                                                                            *
* PARAMETERS:                                                                M
*   SrfIgsFile:  The surface, given as IGES files, to rotate volume of       M
*              revolution from, for the microstructure.		             M
*   NumTiles:  Number of tiles to place in the lattice, in the three         M
*              parametric directions of the volume.  Number of NumTiles[2]   M
*              will be rounded to the closest divisable by 4 number.	     M
*   Graded:    We be used to create a graded lattice in extruded direction   M
*              (variable arm thicknesses).				     M
*   Tile:      Type of tile to use.                                          M
*   TileParams: Two or three numeric parameters to control tiles, depending  M
*              on Tile type.						     M
*   MSIGSFile, MSSTLFile:  Names of output file to save the lattice in.      M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:   NULL if succesful. An error string if not.               M
*                                                                            *
* SEE ALSO:                                                                  M
*                                                                            M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLMSFromRuling                                                        M
*****************************************************************************/
const char * MSDLLMSFromRevolution(const char *SrfIgsFile,
				   int NumTiles[3],
				   double Graded[2],
				   MSDLLTileType Tile,
				   double *TileParams,
				   const char *MSIGSFile,
				   const char *MSSTLFile)
{
    char * const ErrStr;
    IrtHmgnMatType UnitMat;
    TrivTVStruct *TV;
    IPObjectStruct *MS, *TileObj, *Srf;

    NumTiles[2] = (NumTiles[2] + 3) / 4;   /* We have 4 domains in revolve. */

    if (!MSDLLVerifyInput(SrfIgsFile, NULL, &Srf, NULL,
			  NumTiles, Graded, Tile, (char ** const) &ErrStr))
        return ErrStr;

    if ((TileObj = MSDLLGetTileAux(Tile, TileParams, Graded,
				   (char ** const) &ErrStr)) == NULL ||
	ErrStr != NULL) {
        sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
        return GlblErrStr;
    }

    TV = IritTrivTVOfRev(Srf -> U.Srfs);

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, Tile, TileParams);
    IritTrivTVFree(TV);
    IritPrsrFreeObject(TileObj);

    IritMiscMatGenUnitMat(UnitMat);
    IritPrsrIgesSaveFile(MS, UnitMat, MSIGSFile, FALSE);
    IritPrsrSTLSaveFile(MS, UnitMat, MSSTLFile, NULL);

    IritPrsrFreeObject(MS);

    return NULL;
}
