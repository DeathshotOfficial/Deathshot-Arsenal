import asyncio
import os
import platform
import subprocess
import tempfile
import uuid
from aiohttp import web
from PIL import Image
import server

from .ds_load_image import DS_LoadImage

_current_dialog_proc = None


def _open_native_file_dialog(initial_dir=""):
    global _current_dialog_proc
    if os.environ.get("HEADLESS", "false").lower() == "true":
        return None, "Headless mode detected"

    system = platform.system()
    clean_init = str(initial_dir or "").strip().strip('"').strip("'")
    if clean_init and os.path.isfile(clean_init):
        clean_init = os.path.dirname(clean_init)

    if system == "Windows":
        if _current_dialog_proc is not None:
            try:
                _current_dialog_proc.kill()
            except Exception:
                pass
            _current_dialog_proc = None

        ps_file = os.path.join(tempfile.gettempdir(), f"_ds_browse_file_{uuid.uuid4().hex[:8]}.ps1")
        init_escaped = clean_init.replace("'", "''") if clean_init else ""

        ps_script = r'''
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
class FileOpenDialogCOM {}

[ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}

[ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
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

public static class DSFilePicker {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

    public static string Pick(string initialDir, string title) {
        IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogCOM();
        try {
            dlg.SetTitle(title);
            dlg.SetOkButtonLabel("Select Image");
            uint opts;
            dlg.GetOptions(out opts);
            dlg.SetOptions(opts | 0x40u | 0x8u);

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
$result = [DSFilePicker]::Pick('{init_escaped}', 'Select Image - Deathshot Arsenal')
if ($result) {{ [Console]::Out.Write($result) }}
'''
        try:
            with open(ps_file, "w", encoding="utf-8") as f:
                f.write(ps_script)

            proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps_file],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if platform.system() == "Windows" else 0,
            )
            _current_dialog_proc = proc
            try:
                stdout_data, stderr_data = proc.communicate(timeout=180)
            except subprocess.TimeoutExpired:
                proc.kill()
                return None, "Dialog timed out after 3 minutes"
            finally:
                _current_dialog_proc = None

            chosen = stdout_data.decode("utf-8", errors="replace").strip()
            if chosen and os.path.isfile(chosen):
                return chosen, None
            return None, "No file selected (cancelled)"
        except Exception as e:
            return None, str(e)
        finally:
            try:
                if os.path.exists(ps_file):
                    os.remove(ps_file)
            except Exception:
                pass
    return None, "Platform not supported for native dialog"


def _list_image_files(folder_path):
    if not folder_path or not os.path.isdir(folder_path):
        return []
    valid_exts = {ext.lower() for ext in Image.registered_extensions()}
    valid_exts.update({".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff", ".tif"})
    files = []
    try:
        with os.scandir(folder_path) as entries:
            for entry in entries:
                if not entry.is_file() or entry.name.startswith("."):
                    continue
                ext = os.path.splitext(entry.name)[1].lower()
                if ext in valid_exts:
                    norm = os.path.normpath(entry.path).replace("\\", "/")
                    files.append({
                        "name": entry.name,
                        "path": norm,
                    })
    except Exception:
        pass
    files.sort(key=lambda x: x["name"].lower())
    return files


def register_routes():
    try:
        if not hasattr(server, "PromptServer") or not hasattr(server.PromptServer, "instance") or server.PromptServer.instance is None:
            return
        routes = server.PromptServer.instance.routes

        @routes.post("/ds/load_image/browse_file")
        async def api_browse_file(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            init_dir = data.get("path", "")
            loop = asyncio.get_event_loop()
            path, err = await loop.run_in_executor(None, _open_native_file_dialog, init_dir)
            if err and not path:
                is_cancel = ("cancel" in err.lower() or "timed out" in err.lower())
                return web.json_response({"error": err, "path": "", "cancelled": is_cancel})

            clean_path = os.path.normpath(path).replace("\\", "/") if path else ""
            folder = os.path.dirname(clean_path) if clean_path else ""
            files = _list_image_files(folder) if folder else []
            return web.json_response({
                "path": clean_path,
                "folder": folder,
                "files": files,
                "cancelled": not bool(clean_path),
            })

        @routes.post("/ds/load_image/folder_files")
        async def api_folder_files(request):
            try:
                data = await request.json()
            except Exception:
                data = {}
            folder = str(data.get("folder", "") or "").strip()
            files = _list_image_files(folder)
            return web.json_response({"folder": folder, "files": files})

    except Exception as e:
        print(f"[DeathshotArsenal] Load Image route registration error: {e}")


register_routes()

NODE_CLASS_MAPPINGS = {"DS_LoadImage": DS_LoadImage}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_LoadImage": "DS Load Image"}
