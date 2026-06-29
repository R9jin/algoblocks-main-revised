# update-ai.ps1

# Define the root of the project
$rootDir = ".\"
$outputFile = "ai_context.txt"

# Define extensions to capture (Source Code)
$includedExtensions = @("*.py", "*.jsx", "*.js", "*.css", "*.html")

# Define folders/files to explicitly exclude (Datasets, Dependencies, Builds)
$excludedPaths = @(
    "*frontend\public\data\*",
    "*node_modules\*",
    "*.git\*",
    "*__pycache__\*",
    "*.json",
    "*.csv",
    "*.jsonl"
)

# Fetch all relevant files
$files = Get-ChildItem -Path $rootDir -Include $includedExtensions -File -Recurse | Where-Object {
    $currentFile = $_.FullName
    $skip = $false
    
    foreach ($exclude in $excludedPaths) {
        if ($currentFile -like $exclude) {
            $skip = $true
            break
        }
    }
    
    return -not $skip
}

# Clear previous output
Clear-Content -Path $outputFile -ErrorAction SilentlyContinue

# Generate Snapshot Header
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $outputFile -Value "--- PROJECT SNAPSHOT ---`n"
Add-Content -Path $outputFile -Value "--- TIMESTAMP: $timestamp ---`n`n"

# Append files
foreach ($file in $files) {
    # Format path relative to the root directory
    $relativePath = $file.FullName.Replace((Resolve-Path $rootDir).Path + "\", "").Replace("\", "/")
    
    Add-Content -Path $outputFile -Value "--- FILE: $relativePath ---`n`n"
    
    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        Add-Content -Path $outputFile -Value $content
        Add-Content -Path $outputFile -Value "`n`n"
    }
}

Write-Host "Snapshot successfully generated to $outputFile (Datasets excluded)." -ForegroundColor Green