; Inno Setup script — compile after build_installer.bat produces dist\AHR-Inventory
; Gives a normal Windows "Next-Next-Finish" installer with Desktop/Start shortcuts.
[Setup]
AppName=AHR Maintenance Inventory
AppVersion=2.0
DefaultDirName={autopf}\AHR Maintenance Inventory
DefaultGroupName=AHR Maintenance Inventory
OutputBaseFilename=AHR-Inventory-Setup
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest

[Files]
Source: "..\dist\AHR-Inventory\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AHR Maintenance Inventory"; Filename: "{app}\AHR-Inventory.exe"
Name: "{autodesktop}\AHR Maintenance Inventory"; Filename: "{app}\AHR-Inventory.exe"

[Run]
Filename: "{app}\AHR-Inventory.exe"; Description: "เปิดโปรแกรมทันที"; Flags: nowait postinstall skipifsilent

[Tasks]
Name: "startup"; Description: "เปิดโปรแกรมอัตโนมัติเมื่อเปิดเครื่อง"; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; \
  ValueName: "AHRInventory"; ValueData: """{app}\AHR-Inventory.exe"""; Tasks: startup; Flags: uninsdeletevalue
