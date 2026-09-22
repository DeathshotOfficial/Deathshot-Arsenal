# DeathshotArsenal/nodes/Gallery/__init__.py
import os
import sys
import io
import uuid
import logging
import tempfile
import platform
import subprocess
import mimetypes
import asyncio
from aiohttp import web
import server

from .ds_gallery import DS_Gallery
from .gallery_scanner import scan_gallery_folder, is_safe_subpath
from .thumbnail_cache import generate_thumbnail, clear_thumbnail_cache
from .nsfw_manager import nsfw_manager

_current_dialog_proc = None


def _open_native_folder_dialog(initial_dir=""):
    """
    Open native OS directory browser dialog.
    Runs in a worker thread to avoid blocking the aiohttp async loop.
    """
    global _current_dialog_proc
    if os.environ.get("HEADLESS", "false").lower() == "true":
        return None, "Headless mode detected"

    system = platform.system()
    clean_init = str(initial_dir or "").strip().strip('"').strip("'")

    if system == "Windows":
        if _current_dialog_proc is not None:
            try:
                _current_dialog_proc.kill()
            except Exception:
                pass
            _current_dialog_proc = None

        ps_file = os.path.join(tempfile.gettempdir(), f"_ds_gallery_browse_{uuid.uuid4().hex[:8]}.ps1")
        init_escaped = clean_init.replace("'", "''") if clean_init else ""

        ps_script = r'''
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class FileOpenDialogCOM {}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr hwndOwner);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, uint fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
    void GetResults(out IntPtr ppenum);
    void GetSelectedItems(out IntPtr ppsai);
}

public static class DSFolderPicker {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(
        string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    public static string Pick(string initialDir, string title) {
        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogCOM();
        try {
            dlg.SetTitle(title);
            dlg.SetOkButtonLabel("Select Folder");
            uint opts;
            dlg.GetOptions(out opts);
            dlg.SetOptions(opts | 0x20u | 0x40u | 0x8u);

            if (!string.IsNullOrEmpty(initialDir) && System.IO.Directory.Exists(initialDir)) {
                Guid riid = typeof(IShellItem).GUID;
                IShellItem folder;
                try {
                    SHCreateItemFromParsingName(initialDir, IntPtr.Zero, ref riid, out folder);
                    if (folder != null) dlg.SetFolder(folder);
                } catch {}
            }

            IntPtr hwndOwner = GetForegroundWindow();
            int hr = dlg.Show(hwndOwner);
            if (hr != 0) return null;

            IShellItem result;
            dlg.GetResult(out result);
            string path;
            result.GetDisplayName(0x80058000u, out path);
            return path;
        } catch { return null; }
    }
}
"@

''' + f'''
$result = [DSFolderPicker]::Pick('{init_escaped}', 'Select Media Folder - DS Gallery')
if ($result) {{ [Console]::Out.Write($result) }}
'''
        try:
            with open(ps_file, "w", encoding="utf-8") as f:
                f.write(ps_script)

            proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", ps_file],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            _current_dialog_proc = proc
            stdout, stderr = proc.communicate(timeout=120)
            _current_dialog_proc = None
            if proc.returncode == 0 and stdout.strip():
                return stdout.strip(), None
            return None, stderr.strip() or "Folder selection cancelled"
        except subprocess.TimeoutExpired:
            if _current_dialog_proc:
                try:
                    _current_dialog_proc.kill()
                except Exception:
                    pass
                _current_dialog_proc = None
            return None, "Folder selection timed out"
        except Exception as e:
            return None, f"Windows dialog failed: {e}"
        finally:
            if os.path.exists(ps_file):
                try:
                    os.remove(ps_file)
                except Exception:
                    pass

    elif system == "Darwin":
        try:
            cmd = 'osascript -e \'POSIX path of (choose folder with prompt "Select Media Folder")\''
            res = subprocess.check_output(cmd, shell=True, text=True).strip()
            if res:
                return res, None
        except Exception as e:
            return None, f"macOS dialog failed: {e}"

    else:
        for tool in [["zenity", "--file-selection", "--directory"], ["kdialog", "--getexistingdirectory"]]:
            try:
                res = subprocess.check_output(tool, text=True, stderr=subprocess.DEVNULL).strip()
                if res:
                    return res, None
            except Exception:
                continue

    return None, "Native folder dialog not supported on this platform"


def register_routes():
    try:
        if not hasattr(server, "PromptServer") or not hasattr(server.PromptServer, "instance") or server.PromptServer.instance is None:
            return
        routes = server.PromptServer.instance.routes

        @routes.post("/ds/gallery/browse_folder")
        async def api_browse_folder(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            init_dir = data.get("initial_dir", "")
            loop = asyncio.get_event_loop()
            selected, err = await loop.run_in_executor(None, _open_native_folder_dialog, init_dir)
            if selected:
                return web.json_response({"success": True, "path": selected})
            return web.json_response({"success": False, "error": err or "Cancelled"})

        @routes.get("/ds/gallery/scan")
        async def api_gallery_scan(request):
            folder = request.query.get("folder", "")
            media_filter = request.query.get("filter", "all")
            search = request.query.get("search", "")
            sort_by = request.query.get("sort", "name_asc")
            recursive = request.query.get("recursive", "false").lower() == "true"

            loop = asyncio.get_event_loop()
            res = await loop.run_in_executor(
                None, scan_gallery_folder, folder, media_filter, search, sort_by, recursive
            )
            if isinstance(res, dict) and "files" in res:
                cache = nsfw_manager.cache
                for f in res["files"]:
                    try:
                        k = f"{os.path.abspath(f['full_path'])}_{f['mtime']}"
                        f["nsfw_score"] = cache.get(k, None)
                    except Exception:
                        f["nsfw_score"] = None
            return web.json_response(res)

        @routes.post("/ds/gallery/nsfw/eval_batch")
        async def api_nsfw_eval_batch(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            paths = data.get("paths", [])
            if not isinstance(paths, list):
                return web.json_response({"scores": {}})

            valid_paths = [p for p in paths if isinstance(p, str) and os.path.isfile(p)][:32]

            loop = asyncio.get_event_loop()
            scores = await loop.run_in_executor(None, nsfw_manager.get_scores_batch, valid_paths)
            return web.json_response({"scores": scores})

        @routes.get("/ds/gallery/thumbnail")
        async def api_gallery_thumbnail(request):
            path = request.query.get("path", "")
            if not path or not os.path.isfile(path):
                return web.Response(status=404)

            loop = asyncio.get_event_loop()
            try:
                thumb_path = await loop.run_in_executor(None, generate_thumbnail, path)
            except Exception as e:
                return web.Response(status=500, text=f"Thumbnail generation error: {e}")

            headers = {
                "Content-Type": "image/webp",
                "Cache-Control": "public, max-age=86400",
            }
            return web.FileResponse(thumb_path, headers=headers)

        @routes.get("/ds/gallery/media")
        async def api_gallery_media(request):
            path = request.query.get("path", "")
            if not path or not os.path.isfile(path):
                return web.Response(status=404)

            ext = os.path.splitext(path)[1].lower()
            content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
            filename = os.path.basename(path).replace('"', '\\"')
            headers = {
                "Content-Type": content_type,
                "Content-Disposition": f'inline; filename="{filename}"',
                "Accept-Ranges": "bytes",
            }
            return web.FileResponse(path, headers=headers)

        @routes.post("/ds/gallery/delete")
        async def api_gallery_delete(request):
            try:
                data = await request.json()
                files = data.get("files", [])
                if not isinstance(files, list):
                    return web.json_response({"error": "Invalid files parameter"}, status=400)

                deleted = []
                errors = []
                for fpath in files:
                    if os.path.isfile(fpath):
                        try:
                            os.remove(fpath)
                            deleted.append(fpath)
                        except Exception as e:
                            errors.append({"path": fpath, "error": str(e)})
                    else:
                        errors.append({"path": fpath, "error": "File not found"})

                return web.json_response({
                    "success": len(errors) == 0,
                    "deleted_count": len(deleted),
                    "deleted": deleted,
                    "errors": errors
                })
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        @routes.get("/ds/gallery/nsfw/status")
        async def api_nsfw_status(request):
            return web.json_response(nsfw_manager.get_status())

        @routes.post("/ds/gallery/nsfw/download")
        async def api_nsfw_download(request):
            nsfw_manager.start_download()
            return web.json_response(nsfw_manager.get_status())

        @routes.post("/ds/gallery/clear_cache")
        async def api_clear_cache(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            target = data.get("type", "all")

            res = {}
            if target in ("thumbnails", "all"):
                res["thumbnails"] = clear_thumbnail_cache()
            if target in ("nsfw", "all"):
                res["nsfw"] = nsfw_manager.clear_cache()
            return web.json_response({"success": True, "result": res})

    except Exception as e:
        print(f"[DeathshotArsenal] Failed to register DS Gallery routes: {e}", flush=True)


# Automatically register routes and pre-warm detector when imported
register_routes()
nsfw_manager.prewarm()

__all__ = ["DS_Gallery", "scan_gallery_folder", "generate_thumbnail", "nsfw_manager"]
