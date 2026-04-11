Set shell = CreateObject("WScript.Shell")
appFolder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
command = "cmd /c cd /d """ & appFolder & """ && npm start"
shell.Run command, 0, False
