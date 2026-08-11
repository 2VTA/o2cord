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
    private readonly TextBox logBox = new();
    private readonly Button updateButton = new RoundedButton();
    private readonly Button installButton = new RoundedButton();
    private readonly Button repairButton = new RoundedButton();
    private readonly Button uninstallButton = new RoundedButton();
    private readonly Button refreshButton = new RoundedButton();
    private readonly Dictionary<Button, InstallTarget?> targetButtons = new();
    private Button? selectedTargetButton;
    private Button? customButton;

    private static readonly Color Background = Color.FromArgb(7, 10, 18);
    private static readonly Color Card = Color.FromArgb(13, 18, 31);
    private static readonly Color CardSoft = Color.FromArgb(21, 29, 46);
    private static readonly Color Paper = Color.FromArgb(245, 247, 255);
    private static readonly Color PaperMuted = Color.FromArgb(103, 111, 130);
    private static readonly Color Stroke = Color.FromArgb(48, 62, 98);
    private static readonly Color Primary = Color.FromArgb(124, 92, 255);
    private static readonly Color PrimaryHover = Color.FromArgb(151, 124, 255);
    private static readonly Color Success = Color.FromArgb(39, 197, 145);
    private static readonly Color Danger = Color.FromArgb(244, 65, 93);
    private static readonly Color MutedText = Color.FromArgb(158, 170, 198);
    private const int TargetRowWidthFallback = 860;

    public InstallerForm(string[] commandLineArgs)
    {
        Text = IsDebugBuild() ? "o2cord Installer Debug" : "o2cord Installer";
        var icon = LoadLogoIcon();
        if (icon is not null) Icon = icon;

        Width = 1120;
        Height = 840;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1020, 760);
        BackColor = Background;
        ForeColor = Color.WhiteSmoke;
        Font = new Font("Segoe UI", 11);

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(20),
            ColumnCount = 1,
            RowCount = 3,
            BackColor = Background,
        };
        // Header stays a fixed height; the body (targets/actions) and the log
        // split the rest proportionally instead of pinning the log to a stingy
        // fixed height, so extra window height doesn't just pile up as dead
        // space under the action buttons.
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 118));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 60));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 40));
        Controls.Add(root);

        var headerCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 18,
            FillTop = Color.FromArgb(18, 24, 40),
            FillBottom = Color.FromArgb(10, 14, 26),
            BorderColor = Color.FromArgb(62, 76, 118),
            Padding = new Padding(18, 14, 18, 14),
            Margin = new Padding(0, 0, 0, 18)
        };
        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            RowCount = 1,
            BackColor = Background,
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 64));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 132));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));

        // These three cells are left with the default Anchor (None) and a
        // fixed Size instead of Dock+hand-tuned margins, so TableLayoutPanel
        // centers them in the row automatically no matter the header height -
        // that hand-tuned-margin mismatch is what clipped the badge/button
        // before.
        var logoWrap = new RoundedPanel
        {
            Radius = 14,
            FillTop = Color.FromArgb(9, 12, 22),
            FillBottom = Color.Black,
            BorderColor = Color.FromArgb(72, 83, 124),
            Size = new Size(58, 58),
        };
        var logoBox = new PictureBox
        {
            Dock = DockStyle.Fill,
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = LoadLogoImage(),
            Padding = new Padding(8),
        };
        logoWrap.Controls.Add(logoBox);
        header.Controls.Add(logoWrap, 0, 0);

        var titleBlock = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            ColumnCount = 1,
            Margin = new Padding(0),
            BackColor = Color.Transparent,
        };
        titleBlock.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        titleBlock.RowStyles.Add(new RowStyle(SizeType.Absolute, 22));

        var title = new Label
        {
            Text = "o2cord Installer",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.BottomLeft,
            Font = new Font("Segoe UI Variable Display", 24, FontStyle.Bold),
            ForeColor = Color.White,
        };
        titleBlock.Controls.Add(title, 0, 0);

        var subtitle = MakeText("Patch Discord cleanly with a bundled o2cord loader.", 520);
        subtitle.ForeColor = MutedText;
        subtitle.Font = new Font("Segoe UI", 9, FontStyle.Regular);
        subtitle.Margin = new Padding(0);
        titleBlock.Controls.Add(subtitle, 0, 1);

        header.Controls.Add(titleBlock, 1, 0);

        var buildBadge = new RoundedPanel
        {
            Size = new Size(112, 30),
            Radius = 15,
            FillTop = IsDebugBuild() ? Color.FromArgb(89, 58, 186) : Color.FromArgb(28, 128, 91),
            FillBottom = IsDebugBuild() ? Color.FromArgb(58, 39, 126) : Color.FromArgb(19, 84, 62),
            BorderColor = Color.FromArgb(60, Color.White),
        };
        var buildBadgeText = new Label
        {
            Text = IsDebugBuild() ? "DEBUG BUILD" : "PUBLIC BUILD",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = Color.White,
            BackColor = Color.Transparent,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
        };
        buildBadge.Controls.Add(buildBadgeText);
        header.Controls.Add(buildBadge, 2, 0);

        var openDir = MakeButton("Open Folder", Primary);
        openDir.Size = new Size(124, 38);
        openDir.Margin = new Padding(0);
        openDir.Click += (_, _) => OpenDirectory(distDir);
        header.Controls.Add(openDir, 3, 0);

        headerCard.Controls.Add(header);
        root.Controls.Add(headerCard);

        var body = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0, 0, 0, 18),
            BackColor = Color.Transparent,
        };
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 330));
        body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.Controls.Add(body);

        var targetCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 16,
            FillTop = Color.FromArgb(17, 23, 38),
            FillBottom = Color.FromArgb(10, 14, 25),
            BorderColor = Stroke,
            Padding = new Padding(18),
            Margin = new Padding(0, 0, 18, 0),
        };

        var targetArea = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 4,
            ColumnCount = 1,
            Padding = new Padding(0),
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        targetArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        targetArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        targetArea.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        targetArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));

        var selectTitle = MakeText("Discord Target", 280);
        selectTitle.Font = new Font("Segoe UI Variable Display", 15, FontStyle.Bold);
        selectTitle.ForeColor = Color.White;
        selectTitle.Margin = new Padding(0);
        targetArea.Controls.Add(selectTitle, 0, 0);

        var selectHint = MakeText("Pick the app you want to patch.", 280);
        selectHint.ForeColor = MutedText;
        selectHint.Font = new Font("Segoe UI", 8, FontStyle.Regular);
        selectHint.Margin = new Padding(0, 0, 0, 8);
        targetArea.Controls.Add(selectHint, 0, 1);

        // A single-column TableLayoutPanel: each row's control is Dock=Fill,
        // so it always exactly matches the available width. The previous
        // FlowLayoutPanel needed a manual width recalculation on every resize
        // (accounting for the scrollbar, which it got wrong when no
        // scrollbar was actually showing) and that's what produced the
        // horizontal scrollbar/overflow glitch.
        targetList.Dock = DockStyle.Fill;
        targetList.ColumnCount = 1;
        targetList.AutoScroll = true;
        targetList.BackColor = Color.Transparent;
        targetList.Padding = new Padding(0, 2, 0, 0);
        targetList.Margin = new Padding(0);
        targetList.ColumnStyles.Clear();
        targetList.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        targetArea.Controls.Add(targetList, 0, 2);

        customLocation.Dock = DockStyle.Fill;
        customLocation.Enabled = false;
        customLocation.PlaceholderText = "Custom app or resources location";
        customLocation.Margin = new Padding(0, 8, 0, 0);
        customLocation.BackColor = Color.FromArgb(8, 12, 21);
        customLocation.ForeColor = Color.WhiteSmoke;
        customLocation.BorderStyle = BorderStyle.FixedSingle;
        targetArea.Controls.Add(customLocation, 0, 3);
        targetCard.Controls.Add(targetArea);
        body.Controls.Add(targetCard, 0, 0);

        var right = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 120));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        body.Controls.Add(right, 1, 0);

        var infoCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 16,
            FillTop = Color.FromArgb(18, 25, 43),
            FillBottom = Color.FromArgb(10, 15, 27),
            BorderColor = Stroke,
            Padding = new Padding(18),
            Margin = new Padding(0, 0, 0, 18),
        };
        var versions = MakeText(
            $"Installer v{Application.ProductVersion}" + (IsDebugBuild() ? " Debug" : " Public") + Environment.NewLine +
            "Local o2cord: bundled" + Environment.NewLine +
            "Supported: Stable, PTB, Canary" + Environment.NewLine +
            $"Install directory: {distDir}",
            520
        );
        versions.Dock = DockStyle.Fill;
        versions.ForeColor = Color.FromArgb(220, 230, 248);
        versions.Font = new Font("Segoe UI", 8, FontStyle.Regular);
        infoCard.Controls.Add(versions);
        right.Controls.Add(infoCard, 0, 0);

        var actionsCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 16,
            FillTop = Color.FromArgb(17, 23, 38),
            FillBottom = Color.FromArgb(10, 14, 25),
            BorderColor = Stroke,
            Padding = new Padding(18),
        };
        var actions = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 5,
            BackColor = Color.Transparent,
        };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        var actionTitle = MakeText("Actions", 520);
        actionTitle.Dock = DockStyle.Fill;
        actionTitle.Font = new Font("Segoe UI Variable Display", 14, FontStyle.Bold);
        actionTitle.ForeColor = Color.White;
        actions.Controls.Add(actionTitle, 0, 0);
        actions.SetColumnSpan(actionTitle, 2);

        updateButton.Text = "Update o2cord";
        installButton.Text = "Install";
        repairButton.Text = "Repair";
        uninstallButton.Text = "Uninstall";
        refreshButton.Text = "Refresh";
        // One accent colour for the two "make it happen" actions, outline
        // buttons for everything secondary - down from five competing solid
        // colours to a palette that reads as one coherent set.
        ConfigureButton(installButton, Primary);
        ConfigureOutlineButton(updateButton, Primary);
        ConfigureOutlineButton(repairButton, MutedText);
        ConfigureOutlineButton(uninstallButton, Danger);
        ConfigureOutlineButton(refreshButton, MutedText);
        actions.Controls.Add(updateButton, 0, 1);
        actions.SetColumnSpan(updateButton, 2);
        actions.Controls.Add(installButton, 0, 2);
        actions.SetColumnSpan(installButton, 2);
        actions.Controls.Add(repairButton, 0, 3);
        actions.Controls.Add(uninstallButton, 1, 3);
        actions.Controls.Add(refreshButton, 0, 4);
        actions.SetColumnSpan(refreshButton, 2);
        actionsCard.Controls.Add(actions);
        right.Controls.Add(actionsCard, 0, 1);

        var logCard = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Radius = 16,
            FillTop = Color.FromArgb(8, 12, 20),
            FillBottom = Color.FromArgb(4, 7, 12),
            BorderColor = Stroke,
            Padding = new Padding(16, 14, 16, 16),
            Margin = new Padding(0),
        };

        var logArea = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            ColumnCount = 1,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        logArea.RowStyles.Add(new RowStyle(SizeType.Absolute, 26));
        logArea.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var logTitle = MakeText("Activity Log", 280);
        logTitle.Font = new Font("Segoe UI Variable Display", 13, FontStyle.Bold);
        logTitle.ForeColor = Color.White;
        logTitle.Margin = new Padding(0);
        logArea.Controls.Add(logTitle, 0, 0);

        logBox.Dock = DockStyle.Fill;
        logBox.Multiline = true;
        logBox.ReadOnly = true;
        logBox.ScrollBars = ScrollBars.Vertical;
        logBox.BackColor = Color.FromArgb(4, 7, 12);
        logBox.ForeColor = Color.FromArgb(216, 227, 246);
        logBox.BorderStyle = BorderStyle.None;
        logBox.Margin = new Padding(0, 8, 0, 0);
        logBox.Font = new Font("Cascadia Mono", 9);
        logBox.Visible = true;
        logArea.Controls.Add(logBox, 0, 1);

        logCard.Controls.Add(logArea);
        root.Controls.Add(logCard);

        updateButton.Click += (_, _) => RunSelected("update");
        installButton.Click += (_, _) => RunSelected("install");
        repairButton.Click += (_, _) => RunSelected("repair");
        uninstallButton.Click += (_, _) => RunSelected("uninstall");
        refreshButton.Click += (_, _) => RefreshTargets();

        Log($"Starting o2cord Installer {Application.ProductVersion} on {Environment.OSVersion} ({RuntimeInformation.OSArchitecture}).");
        RefreshTargets();

        if (commandLineArgs.Length > 0)
            Shown += (_, _) => BeginInvoke(new Action(() => RunCommandLine(commandLineArgs)));
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // A single calm diagonal gradient instead of overlapping colour blobs -
        // reads as a premium dark app shell instead of a busy background.
        using var baseBrush = new LinearGradientBrush(ClientRectangle, Color.FromArgb(9, 11, 18), Color.FromArgb(15, 17, 27), 60f);
        e.Graphics.FillRectangle(baseBrush, ClientRectangle);

        using var glow = new SolidBrush(Color.FromArgb(14, Primary));
        e.Graphics.FillEllipse(glow, Width - 340, -220, 620, 460);
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

        customButton = MakeTargetButton("Custom", "Manual resources folder", true, false);
        customButton.Click += (_, _) => SelectTargetButton(customButton);
        AddRow(customButton, null);

        if (selectedTargetButton is null)
            SelectTargetButton(customButton);

        Log("Targets refreshed.");
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
            var doneText = action == "update" ? "Update complete." : "Done.";
            MessageBox.Show(
                this,
                $"{doneText}\n\nDiscord: {target.Variant.DisplayName}\nApp: {target.LatestApp}",
                "o2cord Installer",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
        }
        catch (Exception ex)
        {
            Log(ex.ToString());
            MessageBox.Show(
                this,
                ex.Message + $"\n\nInstaller log:\n{logPath}",
                "o2cord Installer Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
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

        if (!logBox.IsDisposed)
            logBox.AppendText(message + Environment.NewLine);
    }

    private static Label MakeText(string text, int width)
    {
        return new Label
        {
            Text = text,
            Width = width,
            AutoSize = true,
            ForeColor = Color.WhiteSmoke,
            Margin = new Padding(0, 0, 0, 6),
        };
    }

    private static Button MakeTargetButton(DiscordVariant variant, InstallTarget? target)
    {
        var status = target is null
            ? "not installed"
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
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            Tag = patched ? "patched" : enabled ? "ready" : "missing",
            Radius = 10,
        };

        ApplyTargetButtonStyle(button, false);
        return button;
    }

    // Flat "settings list row" styling: a tinted background plus a left
    // accent bar mark the selected row; every other row stays a plain
    // hairline-free surface so the list reads as one clean group instead of
    // a stack of separately-bordered boxes.
    private static void ApplyTargetButtonStyle(Button button, bool selected)
    {
        var state = button.Tag as string;
        var enabled = state != "missing";
        var fill = selected
            ? Color.FromArgb(30, Primary)
            : enabled
                ? Color.FromArgb(17, 22, 35)
                : Color.FromArgb(12, 15, 23);
        var text = selected
            ? Color.White
            : enabled
                ? Color.FromArgb(226, 233, 247)
                : Color.FromArgb(102, 110, 126);

        button.BackColor = fill;
        button.ForeColor = text;

        if (button is RoundedButton rounded)
        {
            rounded.FillColor = fill;
            rounded.HoverColor = enabled ? (selected ? Color.FromArgb(42, Primary) : Color.FromArgb(24, 30, 46)) : fill;
            rounded.PressedColor = enabled ? ControlPaint.Dark(fill, 0.08f) : fill;
            rounded.BorderColor = Primary;
            rounded.TextColor = text;
            if (button is TargetButton targetButton)
            {
                targetButton.IsSelected = selected;
                targetButton.TargetColor = text;
                targetButton.StatusColor = state == "patched"
                    ? Color.FromArgb(91, 232, 174)
                    : state == "ready"
                        ? Color.FromArgb(126, 215, 255)
                        : Color.FromArgb(112, 121, 140);
                targetButton.AccentColor = Primary;
            }
            rounded.Invalidate();
        }
        else
        {
            button.FlatAppearance.BorderColor = Primary;
        }
    }

    private static Button MakeButton(string text, Color color)
    {
        var button = new RoundedButton { Text = text };
        ConfigureButton(button, color);
        return button;
    }

    private static Button MakePaperButton(string text)
    {
        var button = new Button { Text = text };
        ConfigurePaperButton(button);
        return button;
    }

    private static void ConfigurePaperButton(Button button)
    {
        button.Width = 168;
        button.Height = 44;
        button.Dock = DockStyle.Top;
        button.Margin = new Padding(0, 0, 18, 12);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = Color.White;
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(220, 220, 220);
        button.BackColor = Paper;
        button.ForeColor = Color.Black;
        button.Font = new Font("Segoe UI", 15, FontStyle.Regular);
    }

    private static void ConfigureGhostButton(Button button)
    {
        button.Width = 168;
        button.Height = 38;
        button.Dock = DockStyle.Top;
        button.Margin = new Padding(0, 0, 18, 12);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 1;
        button.FlatAppearance.BorderColor = Color.FromArgb(66, 66, 66);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(28, 28, 28);
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(38, 38, 38);
        button.BackColor = Color.Black;
        button.ForeColor = Color.FromArgb(180, 180, 180);
        button.Font = new Font("Segoe UI", 10, FontStyle.Regular);
    }

    private static void ConfigureButton(Button button, Color color)
    {
        button.Width = 210;
        button.Height = 44;
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(6);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = color == Primary ? PrimaryHover : ControlPaint.Light(color, 0.10f);
        button.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(color, 0.08f);
        button.BackColor = color;
        button.ForeColor = Color.White;
        button.Font = new Font("Segoe UI", 9, FontStyle.Bold);

        if (button is RoundedButton rounded)
        {
            rounded.Radius = 12;
            rounded.FillColor = color;
            rounded.HoverColor = color == Primary ? PrimaryHover : ControlPaint.Light(color, 0.08f);
            rounded.PressedColor = ControlPaint.Dark(color, 0.10f);
            rounded.BorderColor = Color.FromArgb(40, Color.White);
            rounded.TextColor = Color.White;
        }
    }

    // A quiet, low-emphasis counterpart to ConfigureButton: a tinted-glass
    // fill instead of a solid block, used for every action that isn't the
    // main "make it happen" one.
    private static void ConfigureOutlineButton(Button button, Color color)
    {
        button.Width = 210;
        button.Height = 44;
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(6);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = Color.Transparent;
        button.ForeColor = color;
        button.Font = new Font("Segoe UI", 9, FontStyle.Bold);

        if (button is RoundedButton rounded)
        {
            rounded.Radius = 12;
            rounded.FillColor = Color.FromArgb(14, color);
            rounded.HoverColor = Color.FromArgb(30, color);
            rounded.PressedColor = Color.FromArgb(46, color);
            rounded.BorderColor = Color.FromArgb(130, color);
            rounded.TextColor = color;
        }
    }
}

class RoundedButton : Button
{
    private bool hovering;
    private bool pressed;

    public int Radius { get; set; } = 12;
    public Color FillColor { get; set; } = Color.FromArgb(20, 25, 39);
    public Color HoverColor { get; set; } = Color.FromArgb(32, 40, 60);
    public Color PressedColor { get; set; } = Color.FromArgb(16, 20, 32);
    public Color BorderColor { get; set; } = Color.FromArgb(48, 59, 86);
    public Color TextColor { get; set; } = Color.White;

    public RoundedButton()
    {
        DoubleBuffered = true;
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        BackColor = Color.Transparent;
        Cursor = Cursors.Hand;
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        hovering = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        hovering = false;
        pressed = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        pressed = true;
        Invalidate();
        base.OnMouseDown(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        pressed = false;
        Invalidate();
        base.OnMouseUp(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        if (Parent is not null)
        {
            using var parentBrush = new SolidBrush(Parent.BackColor);
            e.Graphics.FillRectangle(parentBrush, ClientRectangle);
        }

        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;

        var fillColor = !Enabled ? Color.FromArgb(14, 17, 25) : pressed ? PressedColor : hovering ? HoverColor : FillColor;
        var textColor = !Enabled ? Color.FromArgb(92, 101, 118) : TextColor;

        using var path = RoundedRect(rect, Radius);
        using var fill = new SolidBrush(fillColor);
        using var border = new Pen(BorderColor, 1);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(border, path);

        var textRect = ClientRectangle;
        textRect = new Rectangle(
            textRect.Left + Padding.Left,
            textRect.Top + Padding.Top,
            textRect.Width - Padding.Left - Padding.Right,
            textRect.Height - Padding.Top - Padding.Bottom
        );

        var flags = TextFormatFlags.VerticalCenter | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis;
        flags |= TextAlign is ContentAlignment.MiddleLeft or ContentAlignment.TopLeft or ContentAlignment.BottomLeft
            ? TextFormatFlags.Left
            : TextFormatFlags.HorizontalCenter;

        TextRenderer.DrawText(e.Graphics, Text, Font, textRect, textColor, fillColor, flags);
    }

    private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

sealed class TargetButton : RoundedButton
{
    public string TargetName { get; set; } = "";
    public string StatusText { get; set; } = "";
    public Color TargetColor { get; set; } = Color.White;
    public Color StatusColor { get; set; } = Color.FromArgb(126, 215, 255);
    public Color AccentColor { get; set; } = Color.FromArgb(48, 59, 86);
    public bool IsSelected { get; set; }

    // Flat "settings row" card: a plain tinted surface, a left accent bar
    // when selected, and a status dot + label instead of the old
    // letter-badge-plus-bordered-pill treatment - fewer competing shapes,
    // reads as one clean list rather than a stack of separate widgets.
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        if (Parent is not null)
        {
            using var parentBrush = new SolidBrush(Parent.BackColor);
            e.Graphics.FillRectangle(parentBrush, ClientRectangle);
        }

        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;

        var fillColor = !Enabled ? Color.FromArgb(12, 15, 23) : FillColor;
        using var path = RoundedRect(rect, Radius);
        using (var fill = new SolidBrush(fillColor))
            e.Graphics.FillPath(fill, path);

        if (IsSelected)
        {
            var barRect = new Rectangle(rect.Left + 1, rect.Top + 8, 3, rect.Height - 16);
            using var barPath = RoundedRect(barRect, 2);
            using var barBrush = new SolidBrush(AccentColor);
            e.Graphics.FillPath(barBrush, barPath);
        }

        var textLeft = 20;
        var titleRect = new Rectangle(textLeft, 8, rect.Width - textLeft - 110, 20);
        var hintRect = new Rectangle(textLeft, 29, rect.Width - textLeft - 110, 16);
        var statusRect = new Rectangle(rect.Width - 100, 0, 92, rect.Height);

        using var titleFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        using var statusFont = new Font("Segoe UI", 7.5f, FontStyle.Bold);
        using var hintFont = new Font("Segoe UI", 7.5f, FontStyle.Regular);

        TextRenderer.DrawText(
            e.Graphics,
            TargetName,
            titleFont,
            titleRect,
            Enabled ? TargetColor : Color.FromArgb(96, 104, 120),
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis
        );
        TextRenderer.DrawText(
            e.Graphics,
            TargetName.Equals("Custom", StringComparison.OrdinalIgnoreCase) ? "Manual resources folder" : "Detected install",
            hintFont,
            hintRect,
            Enabled ? Color.FromArgb(128, 140, 164) : Color.FromArgb(70, 78, 94),
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis
        );

        var dotColor = Enabled ? StatusColor : Color.FromArgb(70, 78, 94);
        var dotRect = new Rectangle(statusRect.Left, statusRect.Top + statusRect.Height / 2 - 3, 6, 6);
        using (var dotBrush = new SolidBrush(dotColor))
            e.Graphics.FillEllipse(dotBrush, dotRect);

        var statusTextRect = new Rectangle(dotRect.Right + 6, statusRect.Top, statusRect.Right - dotRect.Right - 6, statusRect.Height);
        TextRenderer.DrawText(
            e.Graphics,
            StatusText,
            statusFont,
            statusTextRect,
            Enabled ? Color.FromArgb(190, 198, 216) : Color.FromArgb(82, 90, 106),
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis
        );
    }

    private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

sealed class RoundedPanel : Panel
{
    public int Radius { get; set; } = 16;
    public Color FillTop { get; set; } = Color.FromArgb(18, 23, 37);
    public Color FillBottom { get; set; } = Color.FromArgb(12, 16, 28);
    public Color BorderColor { get; set; } = Color.FromArgb(48, 59, 86);

    public RoundedPanel()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
        BackColor = Color.Transparent;
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        if (Parent is not null)
        {
            using var parentBrush = new SolidBrush(Parent.BackColor);
            e.Graphics.FillRectangle(parentBrush, ClientRectangle);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = ClientRectangle;
        rect.Width -= 1;
        rect.Height -= 1;

        using var path = RoundedRect(rect, Radius);
        using var fill = new LinearGradientBrush(rect, FillTop, FillBottom, LinearGradientMode.Vertical);
        using var stroke = new Pen(BorderColor, 1);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(stroke, path);

        base.OnPaint(e);
    }

    private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
    {
        var diameter = radius * 2;
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}
