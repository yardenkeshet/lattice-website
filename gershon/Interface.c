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
#include "../MachineID/machine_lock.h"
#include "inc_irit/geom_lib.h"
#include "inc_irit/allocate.h"
#include "inc_irit/iritprsr.h"
#include "inc_irit/ip_cnvrt.h"
#include "inc_irit/triv_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/user_lib.h"
#include "interface.h"

#define IRIT_PARA_NUM_THREADS	16
// #define MSDLL_MONITOR_MACHINE_ID

typedef struct MSDLLCallBackStruct {
    IrtRType *Graded;
    IrtRType *Params;
    MSDLLTileType TileType;  
} MSDLLCallBackStruct;

static char GlblErrStr[IRIT_LINE_LEN];

static IritPrsrObjectStruct *MSDLLGradingTileCB(
				 IritPrsrObjectStruct *Tile,
				 IritUserMicroPreProcessTileCBStruct *CBData);
static int MSDLLVerifyInput(const char *Srf1IgsFile,
			    const char *Srf2IgsFile,
			    IritPrsrObjectStruct **Srf1,
			    IritPrsrObjectStruct **Srf2,
			    int NumTiles[3],
			    double Graded[2],
			    MSDLLTileType Tile,
			    char ** const ErrStr);
static IritPrsrObjectStruct *MSDLLGetTileAux(MSDLLTileType TileType,
					     IrtRType *Params,
					     IrtRType *Graded,
					     char ** const ErrStr);
static IritPrsrObjectStruct *MSDLLGenMS(const IritTrivTVStruct *TV,
					IritPrsrObjectStruct *TileObj,
					int NumTiles[3],
					double Graded[2],
					MSDLLTileType TileType,
					double *TileParams);
static void MSDLLSaveTrivar(IritTrivTVStruct *TV,
			    const char *TVIGSFile,
			    const char *TVSTLFile);

/*****************************************************************************
* DESCRIPTION:								     *
*   Given t, between zero and one, returns the required grading at that t.   *
*									     *
* PARAMETERS:								     *
*   Tile:    Input tile. expected to be NULL as is recreated it on the fly.  *
*   CBdata:  An	optional call back data	that can be passed by the main	     *
*	     function to these call back functions.			     *
*									     *
* RETURN VALUE:								     *
*   IritPrsrObjectStruct:  Created graded tile.				     *
*****************************************************************************/
static IritPrsrObjectStruct *MSDLLGradingTileCB(
				 IritPrsrObjectStruct *Tile,
				 IritUserMicroPreProcessTileCBStruct *CBData)
{
    int i;
    char *ErrStr;
    MSDLLCallBackStruct
	*LclData = (MSDLLCallBackStruct *) CBData -> CBFuncData;
    CagdRType Graded[2],
	WMin = CBData->DefMapDmnMin[2],
	Dw = CBData -> DefMapDmnMax[2] - WMin,
        *LclMinDmn = CBData -> TileLclDmnMin,
        *LclMaxDmn = CBData -> TileLclDmnMax;

    assert(Tile == NULL);                         /* We build tiles here... */
    
    Graded[0] = IRIT_BLEND(LclData -> Graded[1], LclData -> Graded[0],
			   WMin + Dw * LclMinDmn[2]);
    Graded[1] = IRIT_BLEND(LclData -> Graded[1], LclData -> Graded[0],
			   WMin + Dw * LclMaxDmn[2]);

    Tile = MSDLLGetTileAux(LclData -> TileType, LclData -> Params,
			   Graded, &ErrStr);

    i = IritMiscRandom(0.0, 1.0) > 0.7;
#ifdef MSDLL_MONITOR_MACHINE_ID
    fprintf(stderr, "Failing mode 1 is %d\n", i);
#endif /* MSDLL_MONITOR_MACHINE_ID */
    if (Tile == NULL ||
        /* Verify running on the right server. */
	(i && !MACHINE_LOCK())) {
        Tile = IritPrsrGenNUMValObject(0.0);         /* Return something... */
    }
    else
        Tile = IritGeomTransformObjectInPlace(Tile, CBData -> Mat);

    return Tile;
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   Sets a call back function to be called with a progress report - a number *
* between zero and one (completed task).			             *
*                                                                            *
* PARAMETERS:                                                                *
*   ProgRepFunc:  A new call back function to be called with progress report.*
*                                                                            *
* RETURN VALUE:                                                              *
*   void		                                                     *
*****************************************************************************/
void MSDLLSetProgressReportFuncs(
			       IritMiscProgressReportInitFuncType InitFunc,
			       IritMiscProgressReportUpdateFuncType UpdateFunc,
			       IritMiscProgressReportDoneFuncType DoneFunc,
			       void *CBData)
{
    IritMiscProgressReportSetFuncs(InitFunc, UpdateFunc, DoneFunc, CBData);
}

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
			    IritPrsrObjectStruct **Srf1,
			    IritPrsrObjectStruct **Srf2,
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
        if (NumTiles[i] < 0 || NumTiles[i] > 10) {
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
    else if (!IRIT_PRSR_IS_SRF_OBJ(*Srf1) ||
	     IRIT_CAGD_IS_RATIONAL_SRF((*Srf1) -> U.Srfs) ||
	     (!IRIT_CAGD_IS_BEZIER_SRF((*Srf1) -> U.Srfs) &&
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
	else if (!IRIT_PRSR_IS_SRF_OBJ(*Srf2) ||
		 IRIT_CAGD_IS_RATIONAL_SRF((*Srf2) -> U.Srfs) ||
		 (!IRIT_CAGD_IS_BEZIER_SRF((*Srf2) -> U.Srfs) &&
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
*   Graded:   We be used to create a graded lattice in the ruled direction   *
*             (variable arm thicknesses).				     *
*                                                                            *
* RETURN VALUE:                                                              *
*   IritPrsrObjectStruct *:    The created tile.                             *
*****************************************************************************/
static IritPrsrObjectStruct *MSDLLGetTileAux(MSDLLTileType TileType,
					     IrtRType *Params,
					     IrtRType *Graded,
					     char ** const ErrStr)
{
    int i;
    IrtRType
        GradedMid = IRIT_BLEND(Graded[0], Graded[1], 0.5);
    IritPrsrObjectStruct
        *TileObj = NULL;

    *ErrStr = NULL;

    switch (TileType) {
        default:
        case MSDLL_TILE_CROSS:
	{
	    IrtRType OuterRadii[6], InnerRadii[6];

	    for (i = 0; i < 6; i++) {
	        IrtRType 
		    Gr = i == 4 ? Graded[0] 
			        : (i == 5 ? Graded[1] : GradedMid);
	        OuterRadii[i] = Params[0] * Gr;
		InnerRadii[i] = Params[1] * Gr;
	    }

	    TileObj = IritUserMicro3DCrossTile2(FALSE, OuterRadii,
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
	        CrnrSizes[i] = Params[1] * (i < 4 ? Graded[0] : Graded[1]);

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
	      DiagRadii[i] = Params[1] * (i < 4 ? Graded[0] : Graded[1]);

	    TileObj = IritUserMicro3DCrossDiagTile(TRUE, CrossRadii,
						   DiagRadii, 2 * Params[0],
						   ErrStr);
	    break;
	}
    }

    /* Verify running on the right server. */
    if (!MACHINE_LOCK()) { 
        IrtRType t, d;

        t = IritMiscCPUTime(FALSE) * 10.0;
	t = modf(t, &d);
#	ifdef MSDLL_MONITOR_MACHINE_ID
	    fprintf(stderr, "Failing mode 2 is %f  (%d)\n", t, t > 0.5);
#	endif /* MSDLL_MONITOR_MACHINE_ID */

        if (t > 0.5) {
	    if (IRIT_PRSR_IS_OLST_OBJ(TileObj)) {
	        IritPrsrListObjectInsert(TileObj, 1, NULL);/* Also mem leak.*/
	    }
	    else if (IRIT_PRSR_IS_TRIVAR_OBJ(TileObj)) {
	        TileObj -> U.Trivars -> Pnext = NULL;     /* Also mem leak. */
	    }
	}
    }

    return TileObj;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Creates and save the desired tile.                                       M
*                                                                            *
* PARAMETERS:                                                                M
*   TileType: Tile type to create.                                           M
*   Params:   For Cross tile: (Outer Radius, Inner Radius)                   M
*             For Diagonal tiles: (Center Size, Corner Size, Smooth Factor). M
*             For Cross-Diagonal tile: (Cross Radius, Diagonal Radius)       M
*   Graded:   Will be used to create a graded lattice in the third dim.      M
*             (variable arm thicknesses).				     M
*   MSSTLFile: Name of STL file to save the tile in.	 	             M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:   NULL if succesful. An error string if not.               M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLGetTile                                                             M
*****************************************************************************/
const char *MSDLLGetTile(MSDLLTileType TileType,
			 IrtRType *Params,
			 IrtRType *Graded,
			 const char *MSSTLFile)
{
    char *ErrStr;
    IrtHmgnMatType UnitMat;
    IritPrsrObjectStruct *TileObj;

    IritPrsrSetPolyListCirc(TRUE);

    if ((TileObj = MSDLLGetTileAux(TileType, Params,
				   Graded, &ErrStr)) == NULL ||
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
*   TV:         The macro-shape in which to build the microstructure.        *
*   TileObj:    The tile to use for the lattice.  Should be NULL if Graded.  *
*   NumTiles:   In (u, v, w) parametric directions.                          *
*   Graded:     If tiles should be geometrically graded in the lattice.      *
*               hold the minimal and maximal scales to use in the grading    *
*               of the first parameter in the third (non surface) axis.      *
*   Tile:       Tile type we are employing here.                             *
*   TileParams: Two or three numeric parameters to control tiles, depending  *
*               on Tile type.						     *
*                                                                            *
* RETURN VALUE:                                                              *
*   IritPrsrObjectStruct *:    The created lattice.                          *
*****************************************************************************/
static IritPrsrObjectStruct *MSDLLGenMS(const IritTrivTVStruct *TV,
					IritPrsrObjectStruct *TileObj,
					int NumTiles[3],
					double Graded[2],
					MSDLLTileType TileType,
					double *TileParams)
{
    int i;
    IritPrsrObjectStruct *MS, *MSMerged, *MSSrfs;
    IritUserMicroParamStruct MSParam;
    IritUserMicroRegularParamStruct *MSRegularParam;
    MSDLLCallBackStruct MSDLLParam;

    /* Create the structure to be passed to the call back function. */
    IRIT_ZAP_MEM(&MSParam, sizeof(IritUserMicroParamStruct));
    MSParam.TilingType = IRIT_USER_MICRO_TILE_REGULAR;
    MSParam.DeformMV = IritMvarCnvrtTVToMV(TV);
    MSParam.ApproxLowOrder = 4;
    MSParam.ProgressReport = TRUE;

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

    if (Graded[0] != 1.0 || Graded[1] != 1.0) {
        CagdRType UMin, UMax, VMin, VMax, WMin, WMax;

        /* Use call backs to locally grade the tiles, based on the w axes   */
        /* of the macro shape that is assumed to be in [0, 1].              */
	IritTrivTVDomain(TV, &UMin, &UMax, &VMin, &VMax, &WMin, &WMax);
	assert(IRIT_APX_EQ(WMin, 0.0) && IRIT_APX_EQ(WMax, 1.0));

	IRIT_ZAP_MEM(&MSDLLParam, sizeof(MSDLLCallBackStruct));
	MSDLLParam.Graded = Graded;
	MSDLLParam.Params = TileParams;
	MSDLLParam.TileType = TileType;
	MSParam.U.RegularParam.CBFuncData = &MSDLLParam;

	MSParam.U.RegularParam.PreProcessCBFunc = MSDLLGradingTileCB;
	MSParam.U.RegularParam.Tile = NULL;
    }

    MS = IritUserMicroStructComposition(&MSParam);/* Cnstrct microstructure.*/
    IritMvarMVFree(MSParam.DeformMV);

    for (i = 0; i < 3; ++i)
	IritFree(MSRegularParam -> TilingSteps[i].TilesPerIntervals);

    MSMerged = IritPrsrFlattenForest2(MS, FALSE);
    IritPrsrFreeObject(MS);
    MSSrfs = IritPrsrCoerceObjectTo(MSMerged, IRIT_PRSR_OBJ_SURFACE);
    IritPrsrFreeObject(MSMerged);

    return MSSrfs;
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   Saves the macro shape trivariate to files.                               *
*                                                                            *
*                                                                            *
* PARAMETERS:                                                                *
*   TV:          To save to file.                                            *
*   TVIGSFile:   The IGES file to save the (boundary ofg) TV to.             *
*   TVSTLFile:   The STL file to save the (boundary ofg) TV to.              *
*                                                                            *
* RETURN VALUE:                                                              *
*   void                                                                     *
*****************************************************************************/
static void MSDLLSaveTrivar(IritTrivTVStruct *TV,
			    const char *TVIGSFile,
			    const char *TVSTLFile)
{
    IrtHmgnMatType UnitMat;
    IritCagdSrfStruct
        *BndrySrfs = IritTrivBndrySrfsFromTVs(TV, IRIT_EPS, TRUE, TRUE, TRUE);
    IritPrsrObjectStruct
        *TVSrfObj = IritPrsrGenSRFObject(BndrySrfs);

    IritMiscMatGenUnitMat(UnitMat);

    IritPrsrIgesSaveFile(TVSrfObj, UnitMat, TVIGSFile, FALSE);

    IritPrsrSTLSaveFile(TVSrfObj, UnitMat, TVSTLFile, FALSE);
    IritPrsrFreeObject(TVSrfObj);
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
*                If, however, NumTiles is zero in any direction the          M
*              constructed macro shape trivariate is returned instead.       M
*   Graded:    We be used to create a graded lattice in the ruled direction  M
*              (variable arm thicknesses).				     M
*   TileType:  Type of tile to use.                                          M
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
			      MSDLLTileType TileType,
			      double *TileParams,
			      const char *MSIGSFile,
			      const char *MSSTLFile)
{
    char * const ErrStr;
    IrtHmgnMatType UnitMat;
    IritTrivTVStruct *TV;
    IritPrsrObjectStruct *MS, *TileObj, *Srf1, *Srf2;
	     
    if (!MSDLLVerifyInput(Srf1IgsFile, Srf2IgsFile, &Srf1, &Srf2,
			  NumTiles, Graded, TileType, (char ** const) &ErrStr))
        return ErrStr;

    TV = IritTrivRuledTV(Srf1 -> U.Srfs, Srf2 -> U.Srfs, 2, 2);
    if (NumTiles[0] == 0 || NumTiles[1] == 0 || NumTiles[2] == 0) {
        MSDLLSaveTrivar(TV, MSIGSFile, MSSTLFile);
	return NULL;
    }


    if (Graded[0] != 1.0 || Graded[1] != 1.0) {
        TileObj = NULL;
    }
    else {
        if ((TileObj = MSDLLGetTileAux(TileType, TileParams, Graded,
				   (char ** const) &ErrStr)) == NULL ||
	    ErrStr != NULL) {
	    sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
	    return GlblErrStr;
	}
    }

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, TileType, TileParams);
    IritTrivTVFree(TV);
    if (TileObj != NULL)
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
*                If, however, NumTiles is zero in any direction the          M
*              constructed macro shape trivariate is returned instead.       M
*   Graded:    We be used to create a graded lattice in extruded direction   M
*              (variable arm thicknesses).				     M
*   TileType:  Type of tile to use.                                          M
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
				 MSDLLTileType TileType,
				 double *TileParams,
				 const char *MSIGSFile,
				 const char *MSSTLFile)
{
    char * const ErrStr;
    IritCagdVecStruct ZVec;
    IrtHmgnMatType UnitMat;
    IritTrivTVStruct *TV;
    IritPrsrObjectStruct *MS, *TileObj, *Srf;
	     
    if (!MSDLLVerifyInput(SrfIgsFile, NULL, &Srf, NULL,
			  NumTiles, Graded, TileType, (char ** const) &ErrStr))
        return ErrStr;

    if (ExtrudeLength <= 0.0 || ExtrudeLength > 100.0) {
        return "Extrusion length is not in the valid range.";
    }

    IRIT_ZAP_MEM(&ZVec, sizeof(IritCagdVecStruct));
    ZVec.Vec[2] = ExtrudeLength;
    TV = IritTrivExtrudeTV(Srf -> U.Srfs, &ZVec);
    if (NumTiles[0] == 0 || NumTiles[1] == 0 || NumTiles[2] == 0) {
        MSDLLSaveTrivar(TV, MSIGSFile, MSSTLFile);
	return NULL;
    }

    if (Graded[0] != 1.0 || Graded[1] != 1.0) {
        TileObj = NULL;
    }
    else {
        if ((TileObj = MSDLLGetTileAux(TileType, TileParams, Graded,
				       (char ** const) &ErrStr)) == NULL ||
	    ErrStr != NULL) {
	    sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
	    return GlblErrStr;
	}
    }

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, TileType, TileParams);
    IritTrivTVFree(TV);
    if (TileObj != NULL)
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
*                If, however, NumTiles is zero in any direction the          M
*              constructed macro shape trivariate is returned instead.       M
*   Graded:    We be used to create a graded lattice in extruded direction   M
*              (variable arm thicknesses).				     M
*   TileType:  Type of tile to use.                                          M
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
const char *MSDLLMSFromRevolution(const char *SrfIgsFile,
				  int NumTiles[3],
				  double Graded[2],
				  MSDLLTileType TileType,
				  double *TileParams,
				  const char *MSIGSFile,
				  const char *MSSTLFile)
{
    char * const ErrStr;
    IrtHmgnMatType UnitMat;
    IritTrivTVStruct *TV;
    IritPrsrObjectStruct *MS, *TileObj, *Srf;

    NumTiles[2] = (NumTiles[2] + 3) / 4;   /* We have 4 domains in revolve. */

    if (!MSDLLVerifyInput(SrfIgsFile, NULL, &Srf, NULL,
			  NumTiles, Graded, TileType, (char ** const) &ErrStr))
        return ErrStr;

    TV = IritTrivTVOfRev(Srf -> U.Srfs);
    /* Swap U and W so W will be the revolving axis. */
    IritTrivTVReverse2Dirs2(TV, IRIT_TRIV_CONST_U_DIR, IRIT_TRIV_CONST_W_DIR);
    IritCagdBspKnotScale(TV -> WKnotVector,       /* Map [0, 4] to [ 0, 1]. */
		         IRIT_TRIV_TV_WPT_LST_LEN(TV) + TV -> WOrder, 0.25);

    if (NumTiles[0] == 0 || NumTiles[1] == 0 || NumTiles[2] == 0) {
        MSDLLSaveTrivar(TV, MSIGSFile, MSSTLFile);
	return NULL;
    }

    if (Graded[0] != 1.0 || Graded[1] != 1.0) {
        TileObj = NULL;
    }
    else {
       if ((TileObj = MSDLLGetTileAux(TileType, TileParams, Graded,
				       (char ** const) &ErrStr)) == NULL ||
	    ErrStr != NULL) {
	    sprintf(GlblErrStr, "Failed to create desired tile - %s", ErrStr);
	    return GlblErrStr;
	}
    }

    MS = MSDLLGenMS(TV, TileObj, NumTiles, Graded, TileType, TileParams);
    IritTrivTVFree(TV);
    if (TileObj != NULL)
        IritPrsrFreeObject(TileObj);

    IritMiscMatGenUnitMat(UnitMat);
    IritPrsrIgesSaveFile(MS, UnitMat, MSIGSFile, FALSE);
    IritPrsrSTLSaveFile(MS, UnitMat, MSSTLFile, NULL);

    IritPrsrFreeObject(MS);

    return NULL;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   COnverts a surface model in IGES file to STL, also as a file.            M
*                                                                            *
* PARAMETERS:                                                                M
*   SrfIgsFile:  The surface, given as IGES files, to convert to STL.        M
*   SrfSTLFile:  The surface approximation in STL will be saved here.        M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:  NULL if successful. An error string if not.               M
*                                                                            *
* SEE ALSO:                                                                  M
*                                                                            M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLIGES2STL                                                            M
*****************************************************************************/
const char *MSDLLIGES2STL(const char *SrfIgsFile, const char *SrfSTLFile)
{
    IrtHmgnMatType Mat;
    IritPrsrObjectStruct *PObj;
    IritPrsrIgesLoadDfltFileParamsStruct IgesParams;
	
    IRIT_ZAP_MEM(&IgesParams, sizeof(IritPrsrIgesLoadDfltFileParamsStruct));
    IgesParams = IritPrsrIgesLoadDfltParams;
    IgesParams.DumpAll = FALSE;
    IgesParams.InverseProjCrvOnSrfs = TRUE;
    IgesParams.Messages = 1;

    PObj = IritPrsrIgesLoadFile(SrfIgsFile, &IgesParams);

    if (PObj == NULL)
        return "Failed to read IGES file";

    IritMiscMatGenUnitMat(Mat);

    IritPrsrSTLSaveFile(PObj, Mat, SrfSTLFile, NULL);

    IritPrsrFreeObject(PObj);

    return NULL;
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   COnverts a surface model in IGES file to STL, also as a file.            M
*                                                                            *
* PARAMETERS:                                                                M
*   Tolerance:   Fineness of tessellation approximation.		     M
*                Must be positive number between two and two hundred.        M
*                                                                            *
* RETURN VALUE:                                                              M
*   const char *:  NULL if successful. An error string if not.               M
*                                                                            *
* SEE ALSO:                                                                  M
*                                                                            M
*                                                                            *
* KEYWORDS:                                                                  M
*   MSDLLIGES2STL                                                            M
*****************************************************************************/
const char *MSDLLSetPolyTolerance(int Tolerance)
{
    if (Tolerance < 2 || Tolerance > 200) {
        sprintf(GlblErrStr,
		"Invalid tolerance of %d.  Valid range is [2, ...200]\n",
		Tolerance);
	return GlblErrStr;
    }

    IritPrsrFFCState.OptimalPolygons = FALSE;
    IritPrsrFFCState.FineNess = Tolerance;
    IritPrsrSetPolyListCirc(TRUE);

    return NULL;
}
