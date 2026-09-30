using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

var commandLineArgs = Environment.GetCommandLineArgs().Skip(1).ToArray();
ApplicationConfiguration.Initialize();
Application.Run(new InstallerForm(commandLineArgs));

record DiscordVariant(string DisplayName, string FolderName, string ProcessName);

record InstallTarget(
    DiscordVariant Variant,
    string Root,
    string LatestApp,
    string Resources,
    string Executable,
    bool IsPatched
);

sealed class InstallerForm : Form
{
    private readonly string distDir = Path.Combine(LocalAppData(), "o2cord", "dist");
    private readonly string logPath = Path.Combine(LocalAppData(), "o2cord", "installer.log");
    private readonly List<DiscordVariant> variants = new()
    {
        new("Stable", "Discord", "Discord"),
        new("PTB", "DiscordPTB", "DiscordPTB"),
        new("Canary", "DiscordCanary", "DiscordCanary"),
    };

    private readonly TableLayoutPanel targetList = new();
    private readonly TextBox customLocation = new();
    private readonly Button updateButton = new RoundedButton();
    private readonly Button installButton = new RoundedButton();
    private readonly Button repairButton = new RoundedButton();
    private readonly Button uninstallButton = new RoundedButton();
    private readonly Button refreshButton = new RoundedButton();
    private readonly Dictionary<Button, InstallTarget?> targetButtons = new();
    private Button? selectedTargetButton;
    private Button? customButton;

    private readonly TerminalView terminal = new();
    private readonly bool commandLineMode;

    // ProductVersion carries "+<commit hash>" from the SDK; show just 1.3.2.
    private static string AppVersion => Application.ProductVersion.Split('+')[0];
    private const int TargetRowWidthFallback = 860;

    public InstallerForm(string[] commandLineArgs)
    {
        Text = IsDebugBuild() ? "o2cord Installer Debug" : "o2cord Installer";
        var icon = LoadLogoIcon();
        if (icon is not null) Icon = icon;

        Width = 1120;
        Height = 860;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1020, 780);
        BackColor = Crt.Bezel;
        ForeColor = Crt.Text;
        Font = Crt.Mono(10);
        DoubleBuffered = true;

        // The window is the monitor's bezel; every card inside is a piece of
        // phosphor screen (see RoundedPanel).
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 1,
            RowCount = 3,
            BackColor = Crt.Bezel,
        };
        // Header stays a fixed height; the body (targets/actions) and the log
        // split the rest proportionally.
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 128));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 42));
        Controls.Add(root);

        var headerCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18, 14, 18, 14),
            Margin = new Padding(0, 0, 0, 16),
            GlowStrength = 1f,
        };
        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = Crt.Screen,
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 170));

        // Animated block "O2" + title typing out beside it.
        var logo = new CrtLogo
        {
            Dock = DockStyle.Fill,
            Title = IsDebugBuild() ? "O2CORD INSTALLER // DEBUG" : "O2CORD INSTALLER",
            Subtitle = $"v{AppVersion} :: discord patcher",
            Margin = new Padding(0),
        };
        header.Controls.Add(logo, 0, 0);

        // These two cells keep the default Anchor (None) and a fixed Size so
        // TableLayoutPanel centres them in the row whatever its height.
        var buildBadge = new RoundedPanel
        {
            Size = new Size(138, 32),
            Radius = 16,
            Filled = true,
        };
        var buildBadgeText = new Label
        {
            Text = IsDebugBuild() ? "DEBUG BUILD" : "PUBLIC BUILD",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Crt.Screen,
            // Transparent so the pill's rounded ends show; an opaque label
            // squared them off.
            BackColor = Color.Transparent,
            Font = Crt.Mono(8.5f, true),
        };
        buildBadge.Controls.Add(buildBadgeText);
        header.Controls.Add(buildBadge, 1, 0);

        var openDir = MakeButton("Open Folder", CrtButtonKind.Outline);
        openDir.Size = new Size(160, 40);
        openDir.Dock = DockStyle.None;
        openDir.Margin = new Padding(0);
        openDir.Click += (_, _) => OpenDirectory(distDir);
        header.Controls.Add(openDir, 2, 0);

        headerCard.Controls.Add(header);
        root.Controls.Add(headerCard);

        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0, 0, 0, 16),
            BackColor = Crt.Bezel,
        };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 340));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.Controls.Add(body);

        var targetCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Title = "DISCORD TARGET",
            Padding = new Padding(16, 22, 16, 16),
            Margin = new Padding(0, 0, 16, 0),
        };

        var targetArea = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 3,
            ColumnCount = 1,
            Padding = new Padding(0),
            BackColor = Crt.Screen,
            Margin = new Padding(0),
        };
        targetArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        targetArea.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        targetArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        var selectHint = MakeText("select the discord install to patch", 300);
        selectHint.ForeColor = Crt.Dim;
        selectHint.Font = Crt.Mono(8.5f);
        selectHint.Margin = new Padding(0, 0, 0, 8);
        targetArea.Controls.Add(selectHint, 0, 0);

        // A single-column TableLayoutPanel: each row's control is Dock=Fill,
        // so it always exactly matches the available width.
        targetList.Dock = DockStyle.Fill;
        targetList.ColumnCount = 1;
        targetList.AutoScroll = true;
        targetList.BackColor = Crt.Screen;
        targetList.Padding = new Padding(0, 2, 0, 0);
        targetList.Margin = new Padding(0);
        targetList.ColumnStyles.Clear();
        targetList.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        targetArea.Controls.Add(targetList, 0, 1);

        // Borderless text box inside its own little screen frame - the
        // Windows FixedSingle border was a flat gray box.
        var customFrame = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 4,
            GlowStrength = 0.2f,
            Padding = new Padding(10, 9, 10, 0),
            Margin = new Padding(0, 6, 0, 0),
        };
        // Top, not Fill: a stretched borderless TextBox kept its text at the
        // top and the frame's bottom edge clipped the descenders.
        customLocation.Dock = DockStyle.Top;
        // A borderless TextBox auto-sizes shorter than the mono font's
        // descenders ("p" in "app" was cut) - set the height by hand.
        customLocation.AutoSize = false;
        customLocation.Height = 24;
        customLocation.Enabled = false;
        customLocation.PlaceholderText = "custom app or resources path...";
        customLocation.Margin = new Padding(0);
        customLocation.BackColor = Crt.Screen;
        customLocation.ForeColor = Crt.Hot;
        customLocation.Font = Crt.Mono(9.5f);
        customLocation.BorderStyle = BorderStyle.None;
        customFrame.Controls.Add(customLocation);
        targetArea.Controls.Add(customFrame, 0, 2);
        targetCard.Controls.Add(targetArea);
        body.Controls.Add(targetCard, 0, 0);

        var right = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Crt.Bezel,
            Margin = new Padding(0),
        };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 128));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        body.Controls.Add(right, 1, 0);

        var infoCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Title = "SYSTEM",
            Padding = new Padding(18, 22, 18, 12),
            Margin = new Padding(0, 0, 0, 16),
        };
        // Dotted "key ...... value" readout, like a BIOS info screen.
        string Row(string key, string value) => key.PadRight(18, '.') + " " + value;
        var versions = MakeText(
            Row("INSTALLER", $"v{AppVersion} " + (IsDebugBuild() ? "DEBUG" : "PUBLIC")) + Environment.NewLine +
            Row("PAYLOAD", "o2cord (bundled)") + Environment.NewLine +
            Row("SUPPORTED", "stable / ptb / canary") + Environment.NewLine +
            Row("INSTALL DIR", distDir),
            560
        );
        versions.Dock = DockStyle.Fill;
        versions.ForeColor = Crt.Text;
        versions.Font = Crt.Mono(9);
        infoCard.Controls.Add(versions);
        right.Controls.Add(infoCard, 0, 0);

        var actionsCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Title = "ACTIONS",
            Padding = new Padding(14, 24, 14, 14),
        };
        var actions = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            BackColor = Crt.Screen,
        };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        // Sized to fit the card at the minimum window height (Refresh used
        // to get clipped at the bottom).
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        updateButton.Text = "Update o2cord";
        installButton.Text = "Install";
        repairButton.Text = "Repair";
        uninstallButton.Text = "Uninstall";
        refreshButton.Text = "Refresh";
        // Install is the one lit, breathing button; the rest are outlines.
        // Uninstall glows red so it never reads like just another action.
        ConfigureButton(installButton, CrtButtonKind.Primary);
        ConfigureButton(updateButton, CrtButtonKind.Outline);
        ConfigureButton(repairButton, CrtButtonKind.Quiet);
        ConfigureButton(uninstallButton, CrtButtonKind.Alert);
        ConfigureButton(refreshButton, CrtButtonKind.Quiet);
        actions.Controls.Add(installButton, 0, 0);
        actions.SetColumnSpan(installButton, 2);
        actions.Controls.Add(updateButton, 0, 1);
        actions.SetColumnSpan(updateButton, 2);
        actions.Controls.Add(repairButton, 0, 2);
        actions.Controls.Add(uninstallButton, 1, 2);
        actions.Controls.Add(refreshButton, 0, 3);
        actions.SetColumnSpan(refreshButton, 2);
        actionsCard.Controls.Add(actions);
        right.Controls.Add(actionsCard, 0, 1);

        var logCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Title = "ACTIVITY LOG",
            Padding = new Padding(4, 18, 4, 6),
            Margin = new Padding(0),
        };

        terminal.Dock = DockStyle.Fill;
        terminal.LogPath = logPath;
        terminal.Margin = new Padding(0);
        logCard.Controls.Add(terminal);
        root.Controls.Add(logCard);

        updateButton.Click += (_, _) => RunSelected("update");
        installButton.Click += (_, _) => RunSelected("install");
        repairButton.Click += (_, _) => RunSelected("repair");
        uninstallButton.Click += (_, _) => RunSelected("uninstall");
        refreshButton.Click += (_, _) => RefreshTargets();

        // Command-line runs (debug-build.ps1, auto-repair) skip the typing
        // animation - nobody's watching and it would only slow them down.
        commandLineMode = commandLineArgs.Length > 0;
        terminal.Instant = commandLineMode;
        Log($"O2CORD INSTALLER v{AppVersion} ({(IsDebugBuild() ? "DEBUG" : "PUBLIC")}) :: (c) o2cord");
        Log($"host: {Environment.OSVersion} ({RuntimeInformation.OSArchitecture})");
        Log("scanning for discord installs...");
        RefreshTargets();

        if (commandLineArgs.Length > 0)
            Shown += (_, _) => BeginInvoke(new Action(() => RunCommandLine(commandLineArgs)));
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Crt.DarkChrome(Handle);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // The monitor bezel: a dark plastic gradient with a faint phosphor
        // spill from the screens inside it.
        using var baseBrush = new LinearGradientBrush(ClientRectangle, Crt.Blend(Crt.Bezel, Color.White, 0.03f), Crt.Blend(Crt.Bezel, Color.Black, 0.35f), 90f);
        e.Graphics.FillRectangle(baseBrush, ClientRectangle);
    }

    private static bool IsDebugBuild()
    {
#if INSTALLER_DEBUG
        return true;
#else
        return false;
#endif
    }

    private static Image? LoadLogoImage()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("o2-logo.png");
        if (stream is null) return null;

        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    }

    private static Icon? LoadLogoIcon()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("o2-logo.ico");
        if (stream is null) return null;

        using var icon = new Icon(stream);
        return (Icon)icon.Clone();
    }

    private static string LocalAppData()
    {
        return Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    }

    private void RefreshTargets()
    {
        targetButtons.Clear();
        targetList.Controls.Clear();
        targetList.RowStyles.Clear();
        targetList.RowCount = 0;
        selectedTargetButton = null;

        var detectedTargets = variants
            .Select(variant => new { Variant = variant, Target = FindTarget(variant) })
            .OrderByDescending(entry => entry.Target is not null)
            .ThenBy(entry => entry.Variant.DisplayName == "Stable" ? 0 : entry.Variant.DisplayName == "Canary" ? 1 : 2)
            .ToList();

        void AddRow(Button button, InstallTarget? target)
        {
            var row = targetList.RowCount;
            targetList.RowCount = row + 1;
            targetList.RowStyles.Add(new RowStyle(SizeType.Absolute, 56));
            button.Dock = DockStyle.Fill;
            button.Margin = new Padding(0, 0, 0, 8);
            targetList.Controls.Add(button, 0, row);
            targetButtons[button] = target;
        }

        foreach (var entry in detectedTargets)
        {
            var target = entry.Target;
            var button = MakeTargetButton(entry.Variant, target);
            button.Click += (_, _) => SelectTargetButton(button);
            AddRow(button, target);

            if (selectedTargetButton is null && target is not null)
                SelectTargetButton(button);
        }

        customButton = MakeTargetButton("Custom", "manual", true, false);
        customButton.Click += (_, _) => SelectTargetButton(customButton);
        AddRow(customButton, null);

        if (selectedTargetButton is null)
            SelectTargetButton(customButton);

        // One readout line per Discord, like a device scan.
        foreach (var entry in detectedTargets)
        {
            var status = entry.Target is null ? "not found" : entry.Target.IsPatched ? "PATCHED" : "ready";
            Log($"  {entry.Variant.DisplayName.ToLowerInvariant().PadRight(8, '.')}...... {status}");
        }
        Log("targets refreshed.");
    }

    private void SelectTargetButton(Button button)
    {
        selectedTargetButton = button;
        customLocation.Enabled = button == customButton;

        foreach (var targetButton in targetButtons.Keys)
            ApplyTargetButtonStyle(targetButton, targetButton == button);
    }

    private static string TargetLabel(DiscordVariant variant)
    {
        return variant.DisplayName switch
        {
            "Stable" => "discord",
            "Canary" => "discord" + Environment.NewLine + "canary",
            "PTB" => "discordPtb",
            _ => variant.DisplayName
        };
    }

    private InstallTarget? FindTarget(DiscordVariant variant)
    {
        var root = Path.Combine(LocalAppData(), variant.FolderName);
        if (!Directory.Exists(root)) return null;

        var candidates = Directory.GetDirectories(root, "app-*")
            .Select(path => new
            {
                Path = path,
                Version = Version.TryParse(Path.GetFileName(path).Replace("app-", ""), out var version)
                    ? version
                    : new Version(0, 0),
                LastWrite = Directory.GetLastWriteTimeUtc(path),
                Resources = Path.Combine(path, "resources"),
                Executable = Path.Combine(path, variant.ProcessName + ".exe")
            })
            .Where(entry => Directory.Exists(entry.Resources) && File.Exists(entry.Executable))
            .OrderByDescending(entry => HasUsableAsar(entry.Resources))
            .ThenByDescending(entry => entry.Version)
            .ThenByDescending(entry => entry.LastWrite)
            .ToList();

        var latest = candidates.FirstOrDefault();
        if (latest is null) return null;

        var appAsar = Path.Combine(latest.Resources, "app.asar");
        var backup = Path.Combine(latest.Resources, "_app.asar");
        var isPatched = IsO2cordLoader(appAsar) && IsValidAsar(backup);
        return new InstallTarget(variant, root, latest.Path, latest.Resources, latest.Executable, isPatched);
    }

    private InstallTarget GetSelectedTarget()
    {
        if (selectedTargetButton is null || !targetButtons.TryGetValue(selectedTargetButton, out var selectedTarget))
            throw new InvalidOperationException("Select a Discord install first.");

        if (selectedTargetButton == customButton)
        {
            var raw = customLocation.Text.Trim().Trim('"');
            if (string.IsNullOrWhiteSpace(raw))
                throw new InvalidOperationException("Choose a custom Discord app folder first.");

            if (File.Exists(raw)) raw = Path.GetDirectoryName(raw)!;

            var resources = Path.GetFileName(raw).Equals("resources", StringComparison.OrdinalIgnoreCase)
                ? raw
                : Directory.Exists(Path.Combine(raw, "resources"))
                    ? Path.Combine(raw, "resources")
                    : raw;
            if (!Directory.Exists(resources))
                throw new InvalidOperationException("Custom location must be a Discord app folder or resources folder.");

            var appFolder = Path.GetFileName(resources).Equals("resources", StringComparison.OrdinalIgnoreCase)
                ? Path.GetDirectoryName(resources)!
                : resources;
            var executable = Directory.GetFiles(appFolder, "Discord*.exe")
                .FirstOrDefault(path => !Path.GetFileName(path).Equals("DiscordCrashpad.exe", StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidOperationException("No Discord executable was found in the custom app folder.");
            var processName = Path.GetFileNameWithoutExtension(executable);
            var root = FindDiscordRoot(appFolder);

            return new InstallTarget(
                new DiscordVariant("Custom", Path.GetFileName(root), processName),
                root,
                appFolder,
                resources,
                executable,
                IsO2cordLoader(Path.Combine(resources, "app.asar")) && IsValidAsar(Path.Combine(resources, "_app.asar"))
            );
        }

        return selectedTarget ?? throw new InvalidOperationException("Selected Discord version was not found.");
    }

    private void RunSelected(string action)
    {
        try
        {
            ToggleButtons(false);
            var target = GetSelectedTarget();

            if (action == "uninstall")
                Uninstall(target);
            else
            {
                if (action == "update")
                    Log("Updating bundled o2cord and refreshing the selected Discord install...");
                Install(target, action == "repair" || action == "update");
            }

            RefreshTargets();
            var doneText = action switch
            {
                "update" => "update complete.",
                "uninstall" => "o2cord removed.",
                _ => "o2cord is in.",
            };
            ToggleButtons(true);
            CrtDialog.Show(
                this,
                "done",
                $"{doneText}\n\ndiscord .... {target.Variant.DisplayName}\napp ........ {target.LatestApp}"
            );
        }
        catch (Exception ex)
        {
            Log(ex.ToString());
            ToggleButtons(true);
            CrtDialog.Show(
                this,
                "error",
                ex.Message + $"\n\ninstaller log:\n{logPath}",
                alert: true
            );
        }
        finally
        {
            ToggleButtons(true);
        }
    }

    private void RunCommandLine(string[] args)
    {
        try
        {
            ToggleButtons(false);
            var action = args.Any(arg => arg.Equals("--uninstall", StringComparison.OrdinalIgnoreCase))
                ? "uninstall"
                : args.Any(arg => arg.Equals("--update", StringComparison.OrdinalIgnoreCase))
                    ? "update"
                    : args.Any(arg => arg.Equals("--install", StringComparison.OrdinalIgnoreCase))
                    ? "install"
                    : "repair";
            var targetName = args
                .FirstOrDefault(arg => arg.StartsWith("--target=", StringComparison.OrdinalIgnoreCase))?
                .Split('=', 2)[1];

            if (string.IsNullOrWhiteSpace(targetName))
                throw new InvalidOperationException("Command-line mode requires --target=stable, --target=ptb, or --target=canary.");

            var variant = variants.FirstOrDefault(item =>
                item.DisplayName.Equals(targetName, StringComparison.OrdinalIgnoreCase)
                || item.FolderName.Equals(targetName, StringComparison.OrdinalIgnoreCase)
                || item.ProcessName.Equals(targetName, StringComparison.OrdinalIgnoreCase));
            if (variant is null)
                throw new InvalidOperationException("Unknown Discord target: " + targetName);

            var target = FindTarget(variant)
                ?? throw new InvalidOperationException($"Discord {variant.DisplayName} was not found or is incomplete.");

            if (action == "uninstall") Uninstall(target);
            else Install(target, action == "repair" || action == "update");

            Log($"Command-line {action} completed successfully.");
            Environment.ExitCode = 0;
        }
        catch (Exception ex)
        {
            Log(ex.ToString());
            Environment.ExitCode = 1;
        }
        finally
        {
            Close();
        }
    }

    private void Install(InstallTarget target, bool repair)
    {
        Log($"{(repair ? "Repairing" : "Installing")} {target.Variant.DisplayName}...");
        Log($"Target app: {target.LatestApp}");
        CloseDiscord(target);

        ExtractDist(distDir);

        var appAsar = Path.Combine(target.Resources, "app.asar");
        var backup = Path.Combine(target.Resources, "_app.asar");
        var patcherPath = Path.Combine(distDir, "patcher.js");

        if (!File.Exists(patcherPath))
            throw new InvalidOperationException("Built o2cord patcher.js was not extracted.");

        var appAsarIsFile = File.Exists(appAsar);
        var appAsarIsDir = Directory.Exists(appAsar);
        var hasValidBackup = IsValidAsar(backup);

        if (!appAsarIsFile && !appAsarIsDir && !hasValidBackup)
            throw new InvalidOperationException("No valid app.asar was found. Reinstall this Discord version and try again.");

        if (!hasValidBackup && File.Exists(backup))
        {
            var invalidBackup = backup + ".invalid-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
            Retry(() => File.Move(backup, invalidBackup), "Preserving invalid _app.asar");
        }

        if (!hasValidBackup && appAsarIsFile)
        {
            if (!IsValidAsar(appAsar))
                throw new InvalidOperationException("Discord app.asar is not a valid ASAR archive. Reinstall this Discord version and try again.");

            Retry(() => File.Move(appAsar, backup), "Backing up app.asar");
        }
        else if (hasValidBackup && appAsarIsFile)
            Retry(() => File.Delete(appAsar), "Removing duplicate app.asar");

        if (Directory.Exists(appAsar))
            Retry(() => Directory.Delete(appAsar, true), "Removing old loader");

        WriteLoader(appAsar, patcherPath);
        ValidateInstall(target, appAsar, backup, patcherPath);
        StartDiscord(target);
        Log($"{target.Variant.DisplayName} installed.");
    }

    private void Uninstall(InstallTarget target)
    {
        Log($"Uninstalling from {target.Variant.DisplayName}...");
        CloseDiscord(target);

        var appAsar = Path.Combine(target.Resources, "app.asar");
        var backup = Path.Combine(target.Resources, "_app.asar");

        if (Directory.Exists(appAsar))
            Retry(() => Directory.Delete(appAsar, true), "Removing loader");
        else if (File.Exists(appAsar))
            Retry(() => File.Delete(appAsar), "Removing patched app.asar");

        if (IsValidAsar(backup))
            Retry(() => File.Move(backup, appAsar), "Restoring original app.asar");
        else if (File.Exists(backup))
            throw new InvalidOperationException("The backup _app.asar is invalid. Reinstall Discord to restore its original files.");

        StartDiscord(target);
        Log($"{target.Variant.DisplayName} uninstalled.");
    }

    private void ExtractDist(string targetDistDir)
    {
        Log("Extracting bundled o2cord files...");
        var parent = Path.GetDirectoryName(targetDistDir)!;
        Directory.CreateDirectory(parent);
        var staging = Path.Combine(parent, "dist.staging-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(staging);

        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("dist.zip")
            ?? throw new InvalidOperationException("Embedded o2cord payload was not found.");
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name)) continue;

            var destination = Path.GetFullPath(Path.Combine(staging, entry.FullName));
            if (!destination.StartsWith(staging + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The embedded payload contains an unsafe path.");

            var destinationDir = Path.GetDirectoryName(destination);
            if (!string.IsNullOrEmpty(destinationDir))
                Directory.CreateDirectory(destinationDir);

            entry.ExtractToFile(destination, true);
        }

        if (!File.Exists(Path.Combine(staging, "patcher.js")) || !File.Exists(Path.Combine(staging, "renderer.js")))
            throw new InvalidOperationException("The bundled o2cord payload is incomplete.");

        var previous = targetDistDir + ".previous";
        if (Directory.Exists(previous)) DeleteDirectory(previous);
        if (Directory.Exists(targetDistDir)) Retry(() => Directory.Move(targetDistDir, previous), "Replacing previous o2cord files");

        try
        {
            Directory.Move(staging, targetDistDir);
            if (Directory.Exists(previous)) DeleteDirectory(previous);
        }
        catch
        {
            if (!Directory.Exists(targetDistDir) && Directory.Exists(previous))
                Directory.Move(previous, targetDistDir);
            throw;
        }
    }

    private void WriteLoader(string appAsar, string patcherPath)
    {
        Directory.CreateDirectory(appAsar);
        File.WriteAllText(Path.Combine(appAsar, "package.json"), "{\"name\":\"o2cord\",\"main\":\"index.js\"}");

        var loader =
            "// o2cord loader\n" +
            "\"use strict\";\n" +
            "const fs = require(\"fs\");\n" +
            "const path = require(\"path\");\n" +
            "const patcherPath = path.join(process.env.LOCALAPPDATA, \"o2cord\", \"dist\", \"patcher.js\");\n" +
            "if (!fs.existsSync(patcherPath)) throw new Error(\"[o2cord] patcher.js not found: \" + patcherPath);\n" +
            "require(patcherPath);\n";
        File.WriteAllText(Path.Combine(appAsar, "index.js"), loader);
    }

    private static bool IsValidAsar(string path)
    {
        if (!File.Exists(path) || new FileInfo(path).Length < 65_536) return false;

        try
        {
            Span<byte> header = stackalloc byte[17];
            using var stream = File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            if (stream.Read(header) != header.Length) return false;
            return BitConverter.ToUInt32(header[..4]) == 4 && header[16] == (byte)'{';
        }
        catch
        {
            return false;
        }
    }

    private static bool HasUsableAsar(string resources)
    {
        var appAsar = Path.Combine(resources, "app.asar");
        return IsValidAsar(appAsar) || IsValidAsar(Path.Combine(resources, "_app.asar")) || IsO2cordLoader(appAsar);
    }

    private static bool IsO2cordLoader(string appAsar)
    {
        if (!Directory.Exists(appAsar)) return false;
        var package = Path.Combine(appAsar, "package.json");
        var index = Path.Combine(appAsar, "index.js");
        if (!File.Exists(package) || !File.Exists(index)) return false;

        try
        {
            return File.ReadAllText(package).Contains("o2cord", StringComparison.OrdinalIgnoreCase)
                && File.ReadAllText(index).Contains("patcher.js", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string FindDiscordRoot(string appFolder)
    {
        var current = new DirectoryInfo(appFolder);
        for (var i = 0; i < 4 && current is not null; i++, current = current.Parent)
        {
            if (File.Exists(Path.Combine(current.FullName, "Update.exe")))
                return current.FullName;
        }

        return Directory.GetParent(appFolder)?.FullName ?? appFolder;
    }

    private static void DeleteDirectory(string path)
    {
        if (!Directory.Exists(path)) return;
        foreach (var file in Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories))
            File.SetAttributes(file, FileAttributes.Normal);
        Directory.Delete(path, true);
    }

    private static void ValidateInstall(InstallTarget target, string appAsar, string backup, string patcherPath)
    {
        if (!File.Exists(target.Executable))
            throw new InvalidOperationException("Discord executable disappeared during installation. Refresh and try again.");
        if (!IsValidAsar(backup))
            throw new InvalidOperationException("The original Discord app.asar backup was not created correctly.");
        if (!IsO2cordLoader(appAsar))
            throw new InvalidOperationException("The o2cord loader was not written correctly.");
        if (!File.Exists(patcherPath) || new FileInfo(patcherPath).Length < 10_000)
            throw new InvalidOperationException("The o2cord payload was not installed correctly.");
    }

    private void Retry(Action action, string label)
    {
        Exception? last = null;

        for (var i = 0; i < 20; i++)
        {
            try
            {
                action();
                return;
            }
            catch (Exception ex)
            {
                last = ex;
                Log($"{label} is busy, waiting...");
                Application.DoEvents();
                Thread.Sleep(1000);
            }
        }

        throw new InvalidOperationException($"{label} failed after retries: {last?.Message}", last);
    }

    // Only closes the selected Discord variant (by process name) and Update.exe
    // instances running out of that variant's own install root - other installed
    // Discord branches (e.g. Stable while patching Canary) are left untouched.
    private void CloseDiscord(InstallTarget target)
    {
        bool IsOwnUpdateProcess(Process process)
        {
            string? path = null;
            try { path = process.MainModule?.FileName; }
            catch { /* access denied on foreign-user or elevated processes */ }

            return path is not null && path.StartsWith(target.Root, StringComparison.OrdinalIgnoreCase);
        }

        for (var pass = 0; pass < 5; pass++)
        {
            var foundAny = false;

            foreach (var process in Process.GetProcessesByName(target.Variant.ProcessName))
            {
                foundAny = true;
                try
                {
                    Log($"Closing {target.Variant.ProcessName} (PID {process.Id})...");
                    process.Kill(true);
                    process.WaitForExit(5000);
                }
                catch (Exception ex)
                {
                    Log($"Could not close {target.Variant.ProcessName} (PID {process.Id}): {ex.Message}");
                }
                finally
                {
                    process.Dispose();
                }
            }

            foreach (var process in Process.GetProcessesByName("Update"))
            {
                if (!IsOwnUpdateProcess(process))
                {
                    process.Dispose();
                    continue;
                }

                foundAny = true;
                try
                {
                    Log($"Closing Update (PID {process.Id})...");
                    process.Kill(true);
                    process.WaitForExit(5000);
                }
                catch (Exception ex)
                {
                    Log($"Could not close Update (PID {process.Id}): {ex.Message}");
                }
                finally
                {
                    process.Dispose();
                }
            }

            if (!foundAny) return;
            Application.DoEvents();
            Thread.Sleep(700);
        }

        if (Process.GetProcessesByName(target.Variant.ProcessName).Length > 0)
            throw new InvalidOperationException(
                $"{target.Variant.DisplayName} is still running and locking its files. Close it from Task Manager, then run Repair again."
            );
    }

    private void StartDiscord(InstallTarget target)
    {
        var update = Path.Combine(target.Root, "Update.exe");
        if (File.Exists(update))
        {
            Log("Starting Discord through Update.exe...");
            Process.Start(new ProcessStartInfo
            {
                FileName = update,
                Arguments = $"--processStart \"{Path.GetFileName(target.Executable)}\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = target.Root,
            });

            for (var i = 0; i < 10; i++)
            {
                Thread.Sleep(500);
                if (Process.GetProcessesByName(target.Variant.ProcessName).Length > 0) return;
                Application.DoEvents();
            }
        }

        if (!File.Exists(target.Executable))
            throw new InvalidOperationException("Discord could not be restarted because its executable was not found.");

        Log("Update.exe did not start Discord; using the app executable directly...");
        Process.Start(new ProcessStartInfo
        {
            FileName = target.Executable,
            UseShellExecute = true,
            WorkingDirectory = target.LatestApp,
        });
    }

    private void OpenDirectory(string path)
    {
        Directory.CreateDirectory(path);
        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true
        });
    }

    private void ToggleButtons(bool enabled)
    {
        // While an action runs the UI thread is busy, so the log prints lines
        // straight away instead of typing them out.
        terminal.Instant = !enabled || commandLineMode;
        updateButton.Enabled = enabled;
        installButton.Enabled = enabled;
        repairButton.Enabled = enabled;
        uninstallButton.Enabled = enabled;
        refreshButton.Enabled = enabled;
    }

    private void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
            File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        }
        catch { }

        if (!terminal.IsDisposed)
            terminal.AppendLine(message);
    }

    private static Label MakeText(string text, int width)
    {
        return new Label
        {
            Text = text,
            Width = width,
            AutoSize = true,
            ForeColor = Crt.Text,
            BackColor = Crt.Screen,
            Margin = new Padding(0, 0, 0, 6),
        };
    }

    private static Button MakeTargetButton(DiscordVariant variant, InstallTarget? target)
    {
        var status = target is null
            ? "not found"
            : target.IsPatched
                ? "patched"
                : "ready";

        return MakeTargetButton(variant.DisplayName, status, target is not null, target?.IsPatched == true);
    }

    private static Button MakeTargetButton(string title, string status, bool enabled, bool patched)
    {
        var button = new TargetButton
        {
            TargetName = title,
            StatusText = status,
            Enabled = enabled,
            AutoSize = false,
            Height = 56,
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0, 0, 0, 8),
            Tag = patched ? "patched" : enabled ? "ready" : "missing",
        };

        ApplyTargetButtonStyle(button, false);
        return button;
    }

    private static void ApplyTargetButtonStyle(Button button, bool selected)
    {
        if (button is TargetButton target)
        {
            target.IsSelected = selected;
            target.State = button.Tag as string ?? "ready";
            target.Invalidate();
        }
    }

    private static Button MakeButton(string text, CrtButtonKind kind)
    {
        var button = new RoundedButton { Text = text };
        ConfigureButton(button, kind);
        return button;
    }

    private static void ConfigureButton(Button button, CrtButtonKind kind)
    {
        button.Width = 210;
        button.Height = 44;
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(6);
        if (button is RoundedButton crt) crt.Kind = kind;
    }
}

enum CrtButtonKind
{
    /// Lit phosphor block that slowly breathes - the one main action.
    Primary,
    /// Phosphor outline that fills in on hover.
    Outline,
    /// Dimmer outline for secondary actions.
    Quiet,
    /// Red outline - destructive (uninstall) or error dialogs.
    Alert,
}

/// Terminal-style button: "[ LABEL ]" in the mono font, a phosphor outline
/// that brightens and blooms on hover (eased, not instant), and inverse video
/// (lit block, dark text) while pressed.
class RoundedButton : Button
{
    private bool hovering;
    private bool pressed;
    private float hover;

    public int Radius { get; set; } = 5;
    public CrtButtonKind Kind { get; set; } = CrtButtonKind.Outline;

    public RoundedButton()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        BackColor = Crt.Screen;
        Cursor = Cursors.Hand;
        Font = Crt.Mono(10, true);
        Crt.Subscribe(OnTick);
    }

    protected override void Dispose(bool disposing)
    {
        Crt.Unsubscribe(OnTick);
        base.Dispose(disposing);
    }

    protected virtual bool Animates => Kind == CrtButtonKind.Primary && Enabled;

    private void OnTick()
    {
        var target = hovering && Enabled ? 1f : 0f;
        var moving = Math.Abs(hover - target) > 0.01f;
        if (moving) hover += (target - hover) * 0.28f;
        else hover = target;
        if ((moving || Animates) && IsHandleCreated && Visible) Invalidate();
    }

    protected override void OnMouseEnter(EventArgs e) { hovering = true; base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovering = false; pressed = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }

    // Layout panels here are "transparent" for layout only - walk up to the
    // first really opaque ancestor to clear against.
    protected static Color ResolveOpaqueBackColor(Control? control)
    {
        while (control is not null)
        {
            if (control.BackColor.A == 255) return control.BackColor;
            control = control.Parent;
        }

        return Crt.Screen;
    }

    protected Color Accent => Kind == CrtButtonKind.Alert ? Crt.Alert : Crt.Phosphor;

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(ResolveOpaqueBackColor(Parent));

        var rect = ClientRectangle;
        rect.Inflate(-2, -2);
        var accent = Accent;
        var breathe = Kind == CrtButtonKind.Primary ? 0.5f + 0.5f * (float)Math.Sin(Crt.Now / 700.0) : 0f;

        Color fill, border, text;
        if (!Enabled)
        {
            fill = Crt.Screen;
            border = Crt.Line;
            text = Crt.Faint;
        }
        else if (pressed)
        {
            fill = Crt.Blend(Crt.Screen, accent, 0.95f);
            border = fill;
            text = Crt.Screen;
        }
        else
        {
            var baseFill = Kind switch
            {
                CrtButtonKind.Primary => 0.20f + 0.06f * breathe,
                CrtButtonKind.Quiet => 0.03f,
                _ => 0.05f,
            };
            var baseEdge = Kind switch
            {
                CrtButtonKind.Primary => 0.85f,
                CrtButtonKind.Quiet => 0.30f,
                _ => 0.55f,
            };
            fill = Crt.Blend(Crt.Screen, accent, baseFill + 0.16f * hover);
            border = Crt.Blend(Crt.Screen, accent, baseEdge + (1 - baseEdge) * hover);
            text = Kind == CrtButtonKind.Quiet
                ? Crt.Blend(Crt.Screen, accent, 0.62f + 0.35f * hover)
                : Crt.Blend(Crt.Screen, Kind == CrtButtonKind.Alert ? accent : Crt.Hot, 0.9f + 0.1f * hover);
        }

        // Bloom around the edge on hover / for the breathing main button.
        var bloom = Enabled ? Math.Max(hover, Kind == CrtButtonKind.Primary ? 0.35f + 0.25f * breathe : 0f) : 0f;
        if (bloom > 0.02f)
        {
            for (var i = 3; i >= 1; i--)
            {
                var halo = rect;
                halo.Inflate(i, i);
                using var hp = Crt.RoundRect(halo, Radius + i);
                using var pen = new Pen(Color.FromArgb((int)(28 * bloom / i), accent), 1.5f);
                g.DrawPath(pen, hp);
            }
        }

        using (var path = Crt.RoundRect(rect, Radius))
        using (var brush = new SolidBrush(fill))
        using (var pen = new Pen(border, 1.2f))
        {
            g.FillPath(brush, path);
            g.DrawPath(pen, path);
        }

        // No red in black and white - destructive actions carry a "!" instead.
        var label = (Kind == CrtButtonKind.Alert ? "! " : "") + Text.ToUpperInvariant();
        label = hover > 0.5f && !pressed ? $"> {label} <" : $"[ {label} ]";
        using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoWrap, Trimming = StringTrimming.EllipsisCharacter };
        Crt.GlowText(g, label, Font, rect, text, fmt, Enabled && !pressed ? 0.6f + 0.4f * hover : 0f);

        using var clip = Crt.RoundRect(rect, Radius);
        g.SetClip(clip);
        Crt.Scanlines(g, this, rect, 38);
        g.ResetClip();
    }
}

/// Discord install as a terminal list row:
///   > PTB ........................ [PATCHED]
///     detected install
/// The selected row turns inverse video with a blinking cursor after the name.
sealed class TargetButton : RoundedButton
{
    public string TargetName { get; set; } = "";
    public string StatusText { get; set; } = "";
    public string State { get; set; } = "ready";
    public bool IsSelected { get; set; }

    protected override bool Animates => IsSelected && Enabled;

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(ResolveOpaqueBackColor(Parent));

        var rect = ClientRectangle;
        rect.Inflate(-1, -1);
        var enabled = Enabled;

        Color fill, edge, main, sub;
        if (IsSelected && enabled)
        {
            fill = Crt.Blend(Crt.Screen, Crt.Phosphor, 0.88f);
            edge = Crt.Hot;
            main = Crt.Screen;
            sub = Crt.Blend(Crt.Screen, Crt.Phosphor, 0.35f);
        }
        else
        {
            var hov = ClientRectangle.Contains(PointToClient(Cursor.Position)) && enabled ? 1f : 0f;
            fill = enabled ? Crt.Blend(Crt.Screen, Crt.Phosphor, 0.04f + 0.08f * hov) : Crt.Screen;
            edge = enabled ? Crt.Blend(Crt.Screen, Crt.Phosphor, 0.25f + 0.3f * hov) : Crt.Line;
            main = enabled ? Crt.Hot : Crt.Faint;
            sub = enabled ? Crt.Dim : Crt.Blend(Crt.Screen, Crt.Phosphor, 0.2f);
        }

        using (var path = Crt.RoundRect(rect, 4))
        using (var brush = new SolidBrush(fill))
        using (var pen = new Pen(edge))
        {
            g.FillPath(brush, path);
            g.DrawPath(pen, path);
        }

        using var nameFont = Crt.Mono(10.5f, true);
        using var smallFont = Crt.Mono(8);
        using var fmt = new StringFormat(StringFormat.GenericTypographic) { FormatFlags = StringFormatFlags.NoWrap, LineAlignment = StringAlignment.Center };

        var name = (IsSelected ? "> " : "  ") + TargetName.ToUpperInvariant();
        var nameRect = new RectangleF(12, 6, rect.Width - 24, 24);
        Crt.GlowText(g, name, nameFont, nameRect, main, fmt, IsSelected ? 0f : 0.5f);

        var nameW = g.MeasureString(name, nameFont, PointF.Empty, fmt).Width;
        if (IsSelected && enabled && (Crt.Now / 530) % 2 == 0)
        {
            using var cursor = new SolidBrush(main);
            var ch = nameFont.GetHeight(g);
            g.FillRectangle(cursor, nameRect.X + nameW + 3, nameRect.Y + (nameRect.Height - ch) / 2 + 2, 8, ch - 4);
        }

        // Status tag on the right, dotted leader in between.
        var tag = "[" + StatusText.ToUpperInvariant() + "]";
        var tagColor = !enabled ? Crt.Faint
            : IsSelected ? Crt.Screen
            : State == "patched" ? Crt.Hot
            : Crt.Dim;
        var tagW = g.MeasureString(tag, smallFont, PointF.Empty, fmt).Width;
        var tagX = rect.Width - 12 - tagW;
        Crt.GlowText(g, tag, smallFont, new RectangleF(tagX, 6, tagW + 4, 24), tagColor, fmt, 0f);

        var dotsStart = nameRect.X + nameW + 16;
        var dotW = g.MeasureString(".", smallFont, PointF.Empty, fmt).Width;
        if (dotW > 0 && tagX - 6 > dotsStart)
        {
            var dots = new string('.', (int)((tagX - 6 - dotsStart) / dotW));
            Crt.GlowText(g, dots, smallFont, new RectangleF(dotsStart, 6, tagX - dotsStart, 24), IsSelected ? sub : Crt.Faint, fmt, 0f);
        }

        var hint = TargetName.Equals("Custom", StringComparison.OrdinalIgnoreCase) ? "manual resources folder" : enabled ? "detected install" : "not installed on this pc";
        Crt.GlowText(g, "  " + hint, smallFont, new RectangleF(12 + 2, 30, rect.Width - 24, 18), sub, fmt, 0f);

        using var clip = Crt.RoundRect(rect, 4);
        g.SetClip(clip);
        Crt.Scanlines(g, this, rect, IsSelected ? 30 : 40);
        g.ResetClip();
    }

    protected override void OnMouseEnter(EventArgs e) { Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { Invalidate(); base.OnMouseLeave(e); }
}

/// A piece of phosphor screen set into the bezel: dark glass with a faint
/// glow, scanlines, a hairline edge with brighter corner brackets, and the
/// section title cut into the top edge like a terminal window frame:
///   ┌─┤ ACTIONS ├──────────────┐
sealed class RoundedPanel : Panel
{
    public int Radius { get; set; } = 8;
    public string Title { get; set; } = "";
    public float GlowStrength { get; set; } = 0.55f;
    /// Solid phosphor block (the build badge) instead of a screen.
    public bool Filled { get; set; }

    public RoundedPanel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        BackColor = Crt.Screen;
    }

    private static Color ResolveOpaqueBackColor(Control? control)
    {
        while (control is not null)
        {
            if (control.BackColor.A == 255) return control.BackColor;
            control = control.Parent;
        }

        return Crt.Bezel;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var parentBrush = new SolidBrush(ResolveOpaqueBackColor(Parent));
        e.Graphics.FillRectangle(parentBrush, ClientRectangle);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;

        if (Filled)
        {
            using var solid = Crt.RoundRect(rect, Radius);
            using var fillBrush = new SolidBrush(Crt.Phosphor);
            g.FillPath(fillBrush, solid);
            return;
        }

        using var path = Crt.RoundRect(rect, Radius);
        using (var fill = new SolidBrush(Crt.Screen))
            g.FillPath(fill, path);

        g.SetClip(path);
        Crt.Glow(g, new Rectangle(-rect.Width / 5, -rect.Height / 3, rect.Width * 7 / 5, rect.Height * 5 / 3), GlowStrength);
        Crt.Scanlines(g, this, rect, 34);
        // Soft inner shadow toward the edges - curved glass.
        using (var shade = new PathGradientBrush(path)
        {
            CenterColor = Color.FromArgb(0, 0, 0, 0),
            SurroundColors = new[] { Color.FromArgb(90, 0, 0, 0) },
            FocusScales = new PointF(0.92f, 0.8f)
        })
            g.FillPath(shade, path);
        g.ResetClip();

        using (var edge = new Pen(Crt.Line))
            g.DrawPath(edge, path);

        // Brighter corner brackets.
        using (var corner = new Pen(Crt.Dim, 1.5f))
        {
            const int L = 14;
            var r = rect;
            g.DrawLines(corner, new[] { new Point(r.Left + 1, r.Top + L), new Point(r.Left + 1, r.Top + 4), new Point(r.Left + 4, r.Top + 1), new Point(r.Left + L, r.Top + 1) });
            g.DrawLines(corner, new[] { new Point(r.Right - L, r.Top + 1), new Point(r.Right - 4, r.Top + 1), new Point(r.Right - 1, r.Top + 4), new Point(r.Right - 1, r.Top + L) });
            g.DrawLines(corner, new[] { new Point(r.Left + 1, r.Bottom - L), new Point(r.Left + 1, r.Bottom - 4), new Point(r.Left + 4, r.Bottom - 1), new Point(r.Left + L, r.Bottom - 1) });
            g.DrawLines(corner, new[] { new Point(r.Right - L, r.Bottom - 1), new Point(r.Right - 4, r.Bottom - 1), new Point(r.Right - 1, r.Bottom - 4), new Point(r.Right - 1, r.Bottom - L) });
        }

        if (Title.Length > 0)
        {
            using var font = Crt.Mono(8.5f, true);
            using var fmt = new StringFormat(StringFormat.GenericTypographic) { FormatFlags = StringFormatFlags.NoWrap };
            var label = $"┤ {Title} ├";
            var size = g.MeasureString(label, font, PointF.Empty, fmt);
            var box = new RectangleF(20, 5, size.Width + 2, size.Height);
            using (var bg = new SolidBrush(Crt.Screen))
                g.FillRectangle(bg, box.X - 2, box.Y, box.Width + 4, box.Height);
            Crt.GlowText(g, label, font, box, Crt.Hot, fmt, 0.7f);
        }

        base.OnPaint(e);
    }
}
