Add-Type -AssemblyName System.Web
$root = 'c:\Users\admin\Desktop\XQX'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8000/')
$listener.Start()
Write-Host "Server running at http://localhost:8000/"
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = $req.Url.LocalPath
    if ($path -eq '/') { $path = '/P1_首页.html' }
    $filePath = Join-Path $root $path.TrimStart('/')
    if (Test-Path -LiteralPath $filePath -PathType Leaf) {
      $mime = [System.Web.MimeMapping]::GetMimeMapping($filePath)
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentType = $mime
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $res.OutputStream.Write($body, 0, $body.Length)
    }
  } catch {
    Write-Host "Error: $_"
  }
  finally {
    if ($res) { $res.Close() }
  }
}
