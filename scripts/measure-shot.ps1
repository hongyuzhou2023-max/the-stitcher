Add-Type -AssemblyName System.Drawing
$path = $args[0]
$b = [System.Drawing.Bitmap]::FromFile($path)
Write-Output ("size: " + $b.Width + "x" + $b.Height)
# 沿中线自上而下扫描，输出每行是否为“黑行”（整行接近纯黑）以定位条带边界
$w = $b.Width
$h = $b.Height
$prev = $null
for ($y = 0; $y -lt $h; $y += 1) {
  $dark = 0
  for ($x = 10; $x -lt ($w - 10); $x += 20) {
    $c = $b.GetPixel($x, $y)
    if (($c.R -lt 26) -and ($c.G -lt 26) -and ($c.B -lt 26)) { $dark += 1 }
  }
  $total = [math]::Floor(($w - 20) / 20)
  $isDark = ($dark -ge ($total * 0.95))
  if ($prev -ne $isDark) {
    Write-Output ("y=" + $y + " -> " + $(if ($isDark) { "DARK" } else { "CONTENT" }))
    $prev = $isDark
  }
}
$b.Dispose()
