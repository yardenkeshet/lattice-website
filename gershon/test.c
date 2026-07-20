/*****************************************************************************
*   Test code for MSDLL.						     *
*									     *
* Written by:  Gershon Elber				Ver 0.2, Nov 2025    *
******************************************************************************
* (C) Gershon Elber, Technion, Israel Institute	of Technology		     *
******************************************************************************
*   Module to provide a lattice generation interface to python.		     *
*****************************************************************************/

#include <stdio.h>
#include <math.h>
#include "inc_irit/misc_lib.h"
#include "inc_irit/geom_lib.h"
#include "inc_irit/allocate.h"
#include "inc_irit/iritprsr.h"
#include "inc_irit/triv_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/cagd_lib.h"
#include "inc_irit/user_lib.h"
#include "interface.h"

static void MicroStructProgressReportDefaultInit(IritMiscProgressReportStruct
								     *PRInfo);
static void MicroStructProgressReportDefaultUpdate(IritMiscProgressReportStruct
								     *PRInfo);
static void MicroStructProgressReportDefaultDone(IritMiscProgressReportStruct
					                             *PRInfo);

/*****************************************************************************
* DESCRIPTION:                                                               *
*   A default progress report init function - justs send IritMsg to stderr.  *
*                                                                            *
* PARAMETERS:                                                                *
*   char:   The message to initialize the progress.                          *
*                                                                            *
* RETURN VALUE:                                                              *
*   void                                                                     *
*****************************************************************************/
static void MicroStructProgressReportDefaultInit(IritMiscProgressReportStruct
					                              *PRInfo)
{
    fprintf(stderr, "%s     ", PRInfo -> InitMsg);
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   A default progress report update function - prints the current progress  *
* in percentages to stderr. 						     *
*                                                                            *
* PARAMETERS:                                                                *
*   Progress: N.S.F.I.                                                       *
*                                                                            *
* RETURN VALUE:                                                              *
*   void                                                                     *
*****************************************************************************/
static void MicroStructProgressReportDefaultUpdate(IritMiscProgressReportStruct
					                              *PRInfo)
{
    fprintf(stderr, "\b\b\b%3d", PRInfo -> Progress);
}

/*****************************************************************************
* DESCRIPTION:                                                               *
*   A default progress report done function - prints a new line to stderr.   *
*                                                                            *
* PARAMETERS:                                                                *
*   None                                                                     *
*                                                                            *
* RETURN VALUE:                                                              *
*   void                                                                     *
*****************************************************************************/
static void MicroStructProgressReportDefaultDone(IritMiscProgressReportStruct
					                              *PRInfo)
{
    fprintf(stderr, "\b\b\b%3d", 100);
    fprintf(stderr, "\n");
}

/*****************************************************************************
* DESCRIPTION:                                                               M
*   Test code.                                                               M
*                                                                            *
* PARAMETERS:                                                                M
*   arc:  N.S.F.I.                                                           M
*   argv: N.S.F.I.                                                           M
*                                                                            *
* RETURN VALUE:                                                              M
*   void                                                                     M
*                                                                            *
* SEE ALSO:                                                                  M
*                                                                            M
*                                                                            *
* KEYWORDS:                                                                  M
*   main                                                                     M
*****************************************************************************/
void main(int arc, char **argv)
{
    int NumTiles0[3] = { 0, 0, 0 },
        NumTiles[3] = { 4, 4, 4 };
    const char *ErrStr,
        *SrfRuled1IgsFile = "Input/RuledSrf1.igs",
	*SrfRuled2IgsFile = "Input/RuledSrf2.igs",
        *SrfExtrdIgsFile = "Input/ExtrudeSrf.igs",
        *SrfRevolvIgsFile = "Input/RevolveSrf.igs",
        *SrfSTLOutputFile = "Data/IGSConverted.stl";
    double TileParams[3],
        Graded[2] = { 0.5, 1.5 };

    MSDLLSetPolyTolerance(50);

    /* Update (once) to report progress. */
    MSDLLSetProgressReportFuncs(MicroStructProgressReportDefaultInit,
				MicroStructProgressReportDefaultUpdate,
				MicroStructProgressReportDefaultDone, NULL);

    ErrStr = MSDLLIGES2STL(SrfRevolvIgsFile, SrfSTLOutputFile);

    fprintf(stderr, "Generates some tiles...\n");
    TileParams[0] = 0.2;
    TileParams[1] = 0.1;
    TileParams[2] = 0.4;
    ErrStr = MSDLLGetTile(MSDLL_TILE_DIAGONAL, TileParams, Graded,
			  "Data/TileDiagonal.stl");
    TileParams[0] = 0.2;
    TileParams[1] = 0.0;
    ErrStr  = MSDLLGetTile(MSDLL_TILE_CROSS, TileParams, Graded,
			   "Data/TileCross.stl");
    TileParams[0] = 0.05;
    TileParams[1] = 3.5;
    ErrStr = MSDLLGetTile(MSDLL_TILE_CROSS_DIAGONAL, TileParams, Graded,
			  "Data/TileCrossDiag.stl");

    fprintf(stderr, "Processing Extrusion...\n");

    /* Center Size, Corner Size, Smooth Factor */
    TileParams[0] = 0.2;
    TileParams[1] = 0.1;
    TileParams[2] = 0.4;
    NumTiles[0] = NumTiles[1] = NumTiles[2] = 3;
    ErrStr = MSDLLMSFromExtrusion(SrfExtrdIgsFile, 1.0, NumTiles0, Graded,
				  MSDLL_TILE_DIAGONAL, TileParams,
				  "Data/TVExtrd.igs", "Data/TVExtrd.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);
    ErrStr = MSDLLMSFromExtrusion(SrfExtrdIgsFile, 1.0, NumTiles, Graded,
				  MSDLL_TILE_DIAGONAL, TileParams,
				  "Data/MSExtrd.igs", "Data/MSExtrd.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);

    fprintf(stderr, "Processing Revolving...\n");

    /* Outer Radius, Inner Radius */
    TileParams[0] = 0.2;
    TileParams[1] = 0.0;
    NumTiles[0] = NumTiles[1] = 2;
    NumTiles[2] = 8;
    ErrStr = MSDLLMSFromRevolution(SrfRevolvIgsFile, NumTiles0, Graded,
				   MSDLL_TILE_CROSS, TileParams,
				   "Data/TVRevolv.igs", "Data/TVRevolv.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);
    ErrStr = MSDLLMSFromRevolution(SrfRevolvIgsFile, NumTiles, Graded,
				   MSDLL_TILE_CROSS, TileParams,
				   "Data/MSRevolv.igs", "Data/MSRevolv.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);

    fprintf(stderr, "Processing Ruling...\n");

    /* Cross Radius, Diagonal Rel Radius */
    TileParams[0] = 0.05;
    TileParams[1] = 3.5;
    NumTiles[0] = NumTiles[1] = 2;
    NumTiles[2] = 3;
    Graded[0] = 0.25;
    Graded[1] = 2.0;

    ErrStr = MSDLLMSFromRuling(SrfRuled1IgsFile, SrfRuled2IgsFile,
			       NumTiles0, Graded, MSDLL_TILE_CROSS_DIAGONAL,
			       TileParams, "Data/TVRuled.igs",
			       "Data/TVRuled.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);
    ErrStr = MSDLLMSFromRuling(SrfRuled1IgsFile, SrfRuled2IgsFile,
			       NumTiles, Graded, MSDLL_TILE_CROSS_DIAGONAL,
			       TileParams, "Data/MSRuled.igs",
			       "Data/MSRuled.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);

    Graded[0] = Graded[1] = 1.0; 			     /* No Grading. */

    ErrStr = MSDLLMSFromRuling(SrfRuled1IgsFile, SrfRuled2IgsFile,
			       NumTiles, Graded, MSDLL_TILE_CROSS_DIAGONAL,
			       TileParams, "Data/MSRuled2.igs",
			       "Data/MSRuled2.stl");
    if (ErrStr != NULL)
        fprintf(stderr, ErrStr);

    fprintf(stderr, "Done...\n");
}
