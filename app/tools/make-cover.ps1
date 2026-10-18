# Draws public/cover.png, the 16:10 game card start.ng shows on its homepage.
# Run from app/:  pwsh -File tools/make-cover.ps1
Add-Type -AssemblyName System.Drawing

$W = 1600
$H = 1000
$out = Join-Path $PSScriptRoot "..\public\cover.png"

$bmp = New-Object System.Drawing.Bitmap -ArgumentList $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

function Col([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function Brush([string]$hex) { New-Object System.Drawing.SolidBrush -ArgumentList (Col $hex) }

function RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Centered() {
  $f = New-Object System.Drawing.StringFormat
  $f.Alignment = [System.Drawing.StringAlignment]::Center
  $f.LineAlignment = [System.Drawing.StringAlignment]::Center
  return $f
}

$g.Clear((Col "#0b0e11"))

# Accent glow under the board.
$glow = New-Object System.Drawing.Drawing2D.GraphicsPath
$glow.AddEllipse(180, 300, 1240, 660)
$pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush -ArgumentList $glow
$pgb.CenterColor = [System.Drawing.Color]::FromArgb(34, 216, 253, 113)
$pgb.SurroundColors = New-Object "System.Drawing.Color[]" 1
$pgb.SurroundColors[0] = [System.Drawing.Color]::FromArgb(0, 216, 253, 113)
$g.FillPath($pgb, $glow)

$titleFont = New-Object System.Drawing.Font -ArgumentList "Arial Black", 120, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$tagFont = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$letterFont = New-Object System.Drawing.Font -ArgumentList "Arial Black", 46, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$valueFont = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 17, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$sideFont = New-Object System.Drawing.Font -ArgumentList "Arial Black", 26, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$scoreFont = New-Object System.Drawing.Font -ArgumentList "Arial Black", 58, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$footFont = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 25, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)

$mid = Centered
$g.DrawString("PICK ME", $titleFont, (Brush "#eef2f6"), (New-Object System.Drawing.RectangleF -ArgumentList 0, 52, $W, 165), $mid)
$g.DrawString("Two words. One survives.", $tagFont, (Brush "#d8fd71"), (New-Object System.Drawing.RectangleF -ArgumentList 0, 218, $W, 58), $mid)

function Tile([single]$cx, [single]$cy, [string]$letter, [string]$value, [string]$border, [string]$fill, [string]$text, [bool]$strike) {
  $size = 108
  $x = $cx - $size / 2
  $y = $cy - $size / 2
  $rect = RoundRect $x $y $size $size 15
  $g.FillPath((Brush $fill), $rect)
  $pen = New-Object System.Drawing.Pen -ArgumentList (Col $border), 4
  $g.DrawPath($pen, $rect)
  $g.DrawString($letter, $letterFont, (Brush $text), (New-Object System.Drawing.RectangleF -ArgumentList $x, ($y - 5), $size, $size), $mid)

  $bottomRight = New-Object System.Drawing.StringFormat
  $bottomRight.Alignment = [System.Drawing.StringAlignment]::Far
  $bottomRight.LineAlignment = [System.Drawing.StringAlignment]::Far
  $g.DrawString($value, $valueFont, (Brush "#8b97a5"), (New-Object System.Drawing.RectangleF -ArgumentList ($x + 8), ($y + 4), ($size - 14), ($size - 12)), $bottomRight)

  if ($strike) {
    $sp = New-Object System.Drawing.Pen -ArgumentList (Col $border), 6
    $g.DrawLine($sp, ($x + 10), $cy, ($x + $size - 10), $cy)
  }
}

$gap = 16
$step = 108 + $gap
$left = 800 - ((4 * 108 + 3 * $gap) / 2) + 54

function Row([string]$word, [single]$cy, [string]$border, [string]$fill, [string]$text, [string]$side, [string]$sideColor, [string]$score, [string]$scoreColor, [bool]$strike, [string[]]$values) {
  $right = New-Object System.Drawing.StringFormat
  $right.Alignment = [System.Drawing.StringAlignment]::Far
  $right.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString($side, $sideFont, (Brush $sideColor), (New-Object System.Drawing.RectangleF -ArgumentList 250, ($cy - 34), 240, 68), $right)
  $g.DrawString($score, $scoreFont, (Brush $scoreColor), (New-Object System.Drawing.RectangleF -ArgumentList 1120, ($cy - 40), 250, 80), (New-Object System.Drawing.StringFormat -Property @{ Alignment = [System.Drawing.StringAlignment]::Near; LineAlignment = [System.Drawing.StringAlignment]::Center }))
  for ($i = 0; $i -lt $word.Length; $i++) {
    Tile ($left + $i * $step) $cy $word[$i] $values[$i] $border $fill $text $strike
  }
}

# The word that lost: still on the board, struck through.
Row "QUAG" 530 "#b0453f" "#1a1114" "#7d625f" "CLUB" "#8b97a5" "14" "#b0453f" $true @("10", "1", "1", "2")
# The word that stands.
Row "QUAD" 712 "#d8fd71" "#1c2610" "#eef2f6" "YOU" "#d8fd71" "14" "#d8fd71" $false @("10", "1", "1", "2")

$rule = New-Object System.Drawing.Pen -ArgumentList (Col "#232b35"), 2
$g.DrawLine($rule, 380, 621, 1220, 621)

$dot = [char]0x00B7
$g.DrawString("you both get the same seven letters $dot a short clock $dot the higher word survives", $footFont, (Brush "#6b7684"), (New-Object System.Drawing.RectangleF -ArgumentList 0, 872, $W, 50), $mid)

$dir = Split-Path $out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

$info = Get-Item $out
"cover written: $($info.FullName)  $([math]::Round($info.Length / 1KB, 1)) KB"
