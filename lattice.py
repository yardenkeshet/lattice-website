import ctypes, struct
from ctypes import c_void_p, c_char_p, c_int, c_double, POINTER, c_int32, create_string_buffer, cast, string_at
import os

MSDLL_TILE_CROSS = 0
MSDLL_TILE_DIAGONAL = 1
MSDLL_TILE_CROSS_DIAGONAL = 2


TILE_TYPE_MAP = {
    "cross": MSDLL_TILE_CROSS,
    "diagonal": MSDLL_TILE_DIAGONAL,
    "cross_diagonal": MSDLL_TILE_CROSS_DIAGONAL,
}

def _load_lattice_dll():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    gershon_dir = os.path.join(base_dir, "gershon")
    dll_path = os.path.join(gershon_dir, "MSDLLD64.dll")
    dll_path = os.path.abspath(dll_path)

    try:
        return ctypes.CDLL(dll_path)
    except OSError as exc:
        raise OSError(
            f"Found DLL at '{dll_path}' but failed to load it. "
            f"This usually means a missing dependency. Original error: {exc}"
        ) from exc


# Load DLL
dll = _load_lattice_dll()

# ---- Configure function signature once ----
dll.MSDLLMSFromRevolution.restype = c_char_p
dll.MSDLLMSFromRevolution.argtypes = [
    c_char_p,          # SrfIgsFile
    POINTER(c_int),    # NumTiles[3]
    POINTER(c_double), # Graded[2]
    c_int,             # TileType
    POINTER(c_double), # TileParams
    c_char_p,          # MSIGSFile
    c_char_p           # MSTLSFile
]


# ---- Wrapper function ----
def MSDLLMSFromRevolution(
        srf_igs_file: bytes,
        num_tiles,
        graded,
        tile_type: int,
        tile_params,
        out_igs_file: bytes,
        out_stl_file: bytes):

    """
    Python wrapper for the C DLL function MSDLLMSFromRevolution()

    Parameters must be passed as 'bytes' for char* and ctypes arrays for numeric arrays.
    """

    result = dll.MSDLLMSFromRevolution(
        srf_igs_file,
        num_tiles,
        graded,
        tile_type,
        tile_params,
        out_igs_file,
        out_stl_file
    )

    # C function returns char*, so decode if not NULL
    if result:
        result = result.decode("utf-8", errors="replace")
        print("DLL returned:", result)

    return (result)

def MSDLLMSFromRuling(
        srf1_igs_file: bytes,
        srf2_igs_file: bytes,
        num_tiles,
        graded,
        tile_type: int,
        tile_params,
        out_igs_file: bytes,
        out_stl_file: bytes):

    # Ensure DLL signature is set only once
    dll.MSDLLMSFromRuling.restype = c_char_p
    dll.MSDLLMSFromRuling.argtypes = [
        c_char_p,            # Srf1IgsFile
        c_char_p,            # Srf2IgsFile
        POINTER(c_int),      # NumTiles[3]
        POINTER(c_double),   # Graded[2]
        c_int,               # TileType
        POINTER(c_double),   # TileParams
        c_char_p,            # MSIGSFilee   (dll author typo)
        c_char_p             # MSTLSFile
    ]

    # Call the actual DLL function
    result = dll.MSDLLMSFromRuling(
        srf1_igs_file,
        srf2_igs_file,
        num_tiles,
        graded,
        tile_type,
        tile_params,
        out_igs_file,
        out_stl_file
    )

    # Decode returned char*
    if result:
        result = result.decode("utf-8", errors="replace")
        print("DLL returned:", result)

    return result


def MSDLLMSFromExtrusion(
        srf_igs_file: bytes,
        extrude_length: float,
        num_tiles,
        graded,
        tile_type: int,
        tile_params,
        out_igs_file: bytes,
        out_stl_file: bytes):

    """
    Python wrapper for the C DLL function MSDLLMSFromExtrusion()

    Parameters match the DLL signature:
        (char*)  SrfIgsFile
        double   ExtrudeLength
        int      NumTiles[3]
        double   Graded[2]
        int      TileType
        double*  TileParams
        (char*)  MSIGSFile
        (char*)  MSTLSFile
    """

    # Configure the DLL function signature
    dll.MSDLLMSFromExtrusion.restype = c_char_p
    dll.MSDLLMSFromExtrusion.argtypes = [
        c_char_p,            # SrfIgsFile
        c_double,            # ExtrudeLength
        POINTER(c_int),      # NumTiles[3]
        POINTER(c_double),   # Graded[2]
        c_int,               # TileType
        POINTER(c_double),   # TileParams
        c_char_p,            # MSIGSFile
        c_char_p             # MSTLSFile
    ]

    # Call the DLL
    result = dll.MSDLLMSFromExtrusion(
        srf_igs_file,
        extrude_length,
        num_tiles,
        graded,
        tile_type,
        tile_params,
        out_igs_file,
        out_stl_file
    )

    # Decode returned char*
    if result:
        result = result.decode("utf-8", errors="replace")
        print("DLL returned:", result)

    return result

def MSDLLGetTile(
        tile_type: int,
        tile_params,
        graded,
        out_json_file: bytes):

    """
    Python wrapper for C function MSDLLGetTile()

    Signature:
        const char* MSDLLGetTile(
            int MSDLLTileType,
            double* Params,
            double* Graded,
            const char* OutJsonFile
        )

    Parameters:
        tile_type      : int
        tile_params    : POINTER(c_double)   (ctypes array)
        graded         : POINTER(c_double)   (ctypes array)
        out_json_file  : bytes               (c_char_p)
    """

    dll.MSDLLGetTile.restype = c_char_p
    dll.MSDLLGetTile.argtypes = [
        c_int,                 # Tile type
        POINTER(c_double),     # Params
        POINTER(c_double),     # Graded
        c_char_p               # Output JSON file
    ]

    print(f"Tile type = {tile_type} params {tile_params[0]} {tile_params[1]} {tile_params[2]}")
    print(f"Tile graded  {graded[0]} {graded[1]} ")
    result = dll.MSDLLGetTile(
        tile_type,
        tile_params,
        graded,
        out_json_file
    )

    # Decode returned char*
    if result:
        result = result.decode("utf-8", errors="replace")
        print("DLL returned:", result)

    return result
