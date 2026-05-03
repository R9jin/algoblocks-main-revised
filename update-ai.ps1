# Configuration
$outputPrefix = "Project_Code_Snapshot_Part_"
$numParts = 5
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "Gathering files and splitting into $numParts parts... please wait." -ForegroundColor Cyan

# 1. Get all tracked files (respecting .gitignore), excluding existing snapshots
$allFiles = git ls-files --cached --others --exclude-standard | Where-Object {
    $_ -notmatch "Project_Code_Snapshot"
}

# 2. Filter for code-related files
$validFiles = @()
foreach ($file in $allFiles) {
    $ext = [System.IO.Path]::GetExtension($file)
    if ($ext -match '\.(py|js|jsx|ts|tsx|html|css|json|java|cpp|h|md|txt)$') {
        $validFiles += $file
    }
}

$totalFiles = $validFiles.Count
if ($totalFiles -eq 0) {
    Write-Host "No code files found!" -ForegroundColor Red
    exit
}

# 3. Calculate chunk size
$chunkSize = [math]::Ceiling($totalFiles / $numParts)
Write-Host "Found $totalFiles files. Putting roughly $chunkSize files in each part." -ForegroundColor Yellow

# 4. Generate the snapshot files
for ($i = 0; $i -lt $numParts; $i++) {
    $partNumber = $i + 1
    $outputFile = "$outputPrefix$partNumber.txt"
    
    # Calculate the range of files for this chunk
    $startIndex = $i * $chunkSize
    $endIndex = [math]::Min((($i + 1) * $chunkSize) - 1, $totalFiles - 1)
    
    if ($startIndex -ge $totalFiles) { break } # Handle rounding edge cases
    
    $chunkFiles = $validFiles[$startIndex..$endIndex]
    
    # Build the content in memory for this part
    $partContent = & {
        "--- PROJECT SNAPSHOT (PART $partNumber OF $numParts) ---`n"
        "--- TIMESTAMP: $timestamp ---`n"
        
        foreach ($file in $chunkFiles) {
            "`n--- FILE: $file ---`n"
            Get-Content $file -ErrorAction SilentlyContinue
        }
    }
    
    # Write to file
    $partContent | Out-File -FilePath $outputFile -Encoding utf8 -Force
    Write-Host "Created $outputFile ($($chunkFiles.Count) files)" -ForegroundColor Green
}

Write-Host "`nSuccess! All $numParts parts have been generated." -ForegroundColor Green