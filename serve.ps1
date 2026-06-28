# PowerShell Static Web Server
# Listens on http://localhost:8080/ and serves files from the directory it is executed in.

$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "=========================================" -ForegroundColor Green
Write-Host "  Local Web Server Running!" -ForegroundColor Green
Write-Host "  URL: http://localhost:$port/" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Green

$currentDir = Get-Location

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Get file path relative to current directory
        $rawUrl = $request.RawUrl.Split('?')[0]
        if ($rawUrl -eq "/") {
            $rawUrl = "/index.html"
        }

        # Replace URL slashes with platform-appropriate path separator
        $subPath = $rawUrl.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath = Join-Path $currentDir $subPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mimeTypes = @{
                ".html" = "text/html; charset=utf-8"
                ".htm"  = "text/html; charset=utf-8"
                ".css"  = "text/css; charset=utf-8"
                ".js"   = "application/javascript; charset=utf-8"
                ".mjs"  = "application/javascript; charset=utf-8"
                ".json" = "application/json; charset=utf-8"
                ".png"  = "image/png"
                ".jpg"  = "image/jpeg"
                ".jpeg" = "image/jpeg"
                ".gif"  = "image/gif"
                ".svg"  = "image/svg+xml"
                ".wasm" = "application/wasm"
                ".mp4"  = "video/mp4"
                ".webm" = "video/webm"
            }

            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            # Enable headers for cross-origin file requests and general testing
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            $response.Headers.Add("Pragma", "no-cache")
            $response.Headers.Add("Expires", "0")
            $response.ContentType = $contentType

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            Write-Host "[200] Served: $rawUrl" -ForegroundColor Cyan
        } else {
            $response.StatusCode = 404
            $response.ContentType = "text/plain"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            Write-Host "[404] Not Found: $rawUrl" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "Error occurred: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped." -ForegroundColor Yellow
}
