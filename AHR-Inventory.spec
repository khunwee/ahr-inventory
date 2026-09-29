# PyInstaller spec — build a single-folder Windows app (run on Windows).
# Usage:  pyinstaller AHR-Inventory.spec
from PyInstaller.utils.hooks import collect_submodules
block_cipher = None

hiddenimports = (collect_submodules('uvicorn') + collect_submodules('apscheduler')
                 + ['app.main', 'anyio', 'httptools', 'websockets'])

a = Analysis(
    ['launcher.py'],
    pathex=['.'],
    binaries=[],
    datas=[('web', 'web'), ('data', 'data'), ('source', 'source'),
           ('.env.example', '.')],
    hiddenimports=hiddenimports,
    hookspath=[], runtime_hooks=[], excludes=[],
    win_no_prefer_redirects=False, win_private_assemblies=False,
    cipher=block_cipher, noarchive=False)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='AHR-Inventory',
          debug=False, bootloader_ignore_signals=False, strip=False,
          upx=True, console=True, icon=None)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, strip=False, upx=True,
               name='AHR-Inventory')
