# DeathshotArsenal/nodes/Load Images From Folder/__init__.py
import asyncio
import os
import platform
import subprocess
import tempfile
from aiohttp import web
import server

from .ds_load_images_from_folder import DS_LoadImagesFromFolder
from .folder_scanner import scan_folder


import uuid
_current_dialog_proc = None


def _open_native_folder_dialog(initial_dir=""):
    """
    Open the native OS directory browser dialog.
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

        ps_file = os.path.join(tempfile.gettempdir(), f"_ds_browse_{uuid.uuid4().hex[:8]}.ps1")
        init_escaped = clean_init.replace("'", "''") if clean_init else ""
        # Modern IFileOpenDialog with FOS_PICKFOLDERS via COM — gives the
        # full Explorer dialog with breadcrumbs, sidebar, search bar, and
        # brings the window directly in front of the browser via GetForegroundWindow().
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
            dlg.SetOptions(opts | 0x20u | 0x40u | 0x8u); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR

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
$result = [DSFolderPicker]::Pick('{init_escaped}', 'Select Image Folder - Deathshot Arsenal')
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
            cmd = 'osascript -e \'POSIX path of (choose folder with prompt "Select Image Folder")\''
            res = subprocess.check_output(cmd, shell=True, text=True).strip()
            if res:
                return res, None
        except Exception as e:
            return None, f"macOS dialog failed: {e}"

    else:
        # Linux zenity or kdialog
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

        @routes.post("/ds/browse_folder")
        async def api_browse_folder(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            init_dir = data.get("path", "")
            loop = asyncio.get_event_loop()
            path, err = await loop.run_in_executor(None, _open_native_folder_dialog, init_dir)
            if err and not path:
                is_cancel = ("cancel" in err.lower() or "timed out" in err.lower())
                return web.json_response({"error": err, "path": "", "cancelled": is_cancel})
            return web.json_response({"path": path or "", "cancelled": not bool(path)})

        @routes.post("/ds/folder_loader/list_dir")
        async def api_list_dir(request):
            """Directory listing for built-in in-browser folder browser."""
            try:
                data = await request.json()
            except Exception:
                data = {}
            target = str(data.get("path", "") or "").strip().strip('"').strip("'")

            # Root drive listing for Windows
            if platform.system() == "Windows" and (not target or target == "/"):
                import string
                drives = []
                for letter in string.ascii_uppercase:
                    d = f"{letter}:\\"
                    if os.path.exists(d):
                        drives.append(d)
                return web.json_response({"current": "", "dirs": drives, "is_drives": True})

            if not target or not os.path.exists(target):
                target = os.path.abspath(".")

            target = os.path.normpath(os.path.abspath(target))
            dirs = []
            try:
                with os.scandir(target) as it:
                    for entry in it:
                        try:
                            if entry.is_dir() and not entry.name.startswith("."):
                                dirs.append(entry.name)
                        except OSError:
                            continue
            except Exception:
                pass

            dirs.sort(key=str.lower)
            return web.json_response({"current": target, "dirs": dirs, "is_drives": False})

        @routes.post("/ds/folder_scan")
        async def api_folder_scan(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            raw_path = data.get("path", "")
            clean_path = str(raw_path or "").strip().strip('"').strip("'")
            clean_path = os.path.expanduser(clean_path)
            clean_path = os.path.normpath(clean_path) if clean_path else ""

            recursive = bool(data.get("recursive", False))
            sort_by = str(data.get("sort_by", "name"))
            sort_dir = str(data.get("sort_dir", "asc"))

            if not clean_path or not os.path.isdir(clean_path):
                return web.json_response({
                    "error": f"Directory not found: '{clean_path}'",
                    "files": [],
                    "total": 0
                }, status=404)

            loop = asyncio.get_event_loop()
            files = await loop.run_in_executor(None, scan_folder, clean_path, recursive, sort_by, sort_dir)
            return web.json_response({
                "path": clean_path,
                "files": files,
                "total": len(files)
            })
    except Exception as e:
        print(f"[DS Load Images From Folder] Failed registering API routes: {e}")


register_routes()

__all__ = ["DS_LoadImagesFromFolder"]
