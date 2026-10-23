; SuperAI Local — Inno Setup installer
; Packs the code-signed superai-local.exe + web/ workbench + icon.ico into a signed setup exe.
; Run after `npm run build:win` and SignPath signing of dist/superai-local.exe:
;   iscc installer.iss  ->  dist/SuperAI-Local-Setup.exe
; The resulting setup exe is then signed again by SignPath in CI.

#define MyAppName      "SuperAI Local"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "SuperAI"
#define MyAppExeName   "superai-local.exe"
#define MyAppURL       "https://github.com/Jay980911/superai-local"

[Setup]
; NOTE: AppId must stay stable across versions for upgrades to work.
AppId={{8F2C1A6B-4D7E-4F9A-B3C2-7E1A5D9B6F01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=SuperAI-Local-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
; Per-user install (no UAC prompt) — friendlier for Smart App Control.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
LicenseFile=LICENSE
SetupIconFile=icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The already-signed exe from dist/ (signed by SignPath before iscc runs).
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; Web workbench assets (served by the exe at runtime).
Source: "web\*"; DestDir: "{app}\web"; Flags: ignoreversion recursesubdirs createallsubdirs
; Tray icon + license
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Register the superai-local:// URL protocol (per-user, HKCU — no admin needed).
Root: HKCU; Subkey: "Software\Classes\superai-local"; ValueType: string; ValueName: ""; ValueData: "URL:SuperAI Local Protocol"; Flags: createvalueifdoesntexist
Root: HKCU; Subkey: "Software\Classes\superai-local"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\superai-local\DefaultIcon"; ValueType: string; ValueData: "{app}\{#MyAppExeName},0"
Root: HKCU; Subkey: "Software\Classes\superai-local\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%1"""

[Run]
; Launch the bridge on finish (hidden tray). /nocancel /silent avoids a second prompt.
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
