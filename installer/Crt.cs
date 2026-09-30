using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// The installer's look: an old CRT terminal, same family as the RetroTerminal
// theme in o2cord itself - in black and white (Ryder's call), a white
// phosphor on a black tube. Public and debug builds share it and differ by
// their badge/title. Everything here is custom-painted GDI+.
static class Crt
{
    public static readonly Color Phosphor = Color.FromArgb(232, 232, 232);
    public static readonly Color Hot = Color.FromArgb(255, 255, 255);
    public static readonly Color Screen = Color.FromArgb(6, 6, 6);
    public static readonly Color Bezel = Color.FromArgb(17, 17, 17);

    // Kept white too, so everything stays black and white: uninstall/errors
    // are set apart by "!!" markers and a brighter edge, not by a colour.
    public static readonly Color Alert = Color.FromArgb(255, 255, 255);

    public static Color Text => Mix(0.92f);
    public static Color Dim => Mix(0.55f);
    public static Color Faint => Mix(0.28f);
    public static Color Line => Mix(0.22f);
    public static Color Wash => Mix(0.08f);

    /// Phosphor blended over the screen colour, fully opaque (the layout
    /// panels here are "transparent" for layout only, so real alpha has
    /// nothing reliable to blend against).
    public static Color Mix(float amount) => Blend(Screen, Phosphor, amount);

    public static Color Blend(Color a, Color b, float t)
    {
        t = Math.Clamp(t, 0f, 1f);
        int L(int x, int y) => (int)Math.Round(x + (y - x) * t);
        return Color.FromArgb(255, L(a.R, b.R), L(a.G, b.G), L(a.B, b.B));
    }

    private static readonly string MonoFamily = PickMono();

    private static string PickMono()
    {
        using var fonts = new InstalledFontCollection();
        var names = fonts.Families.Select(f => f.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var candidate in new[] { "Cascadia Mono", "Consolas", "Courier New" })
            if (names.Contains(candidate)) return candidate;
        return FontFamily.GenericMonospace.Name;
    }

    public static Font Mono(float size, bool bold = false) => new(MonoFamily, size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);

    // --- shared animation clock -------------------------------------------------

    private static System.Windows.Forms.Timer? timer;
    private static event Action? TickHandlers;
    public static long Now => Environment.TickCount64;

    public static void Subscribe(Action handler)
    {
        TickHandlers += handler;
        if (timer is null)
        {
            timer = new System.Windows.Forms.Timer { Interval = 33 };
            timer.Tick += (_, _) => TickHandlers?.Invoke();
            timer.Start();
        }
    }

    public static void Unsubscribe(Action handler) => TickHandlers -= handler;

    // --- drawing helpers --------------------------------------------------------

    /// Horizontal scanlines, phased to the form so they line up across
    /// neighbouring controls instead of restarting at each one's top edge.
    public static void Scanlines(Graphics g, Control owner, Rectangle rect, int alpha = 46)
    {
        var form = owner.FindForm();
        var offset = form is null ? 0 : form.PointToClient(owner.PointToScreen(Point.Empty)).Y;
        using var pen = new Pen(Color.FromArgb(alpha, 0, 0, 0));
        var start = rect.Top - ((rect.Top + offset) % 3 + 3) % 3;
        for (var y = start; y < rect.Bottom; y += 3)
            if (y >= rect.Top) g.DrawLine(pen, rect.Left, y, rect.Right, y);
    }

    /// Soft phosphor bloom behind a spot of the screen.
    public static void Glow(Graphics g, Rectangle area, float strength)
    {
        if (area.Width <= 0 || area.Height <= 0) return;
        using var path = new GraphicsPath();
        path.AddEllipse(area);
        using var brush = new PathGradientBrush(path)
        {
            CenterColor = Color.FromArgb((int)(255 * Math.Clamp(strength, 0f, 1f) * 0.16f), Phosphor),
            SurroundColors = new[] { Color.FromArgb(0, Phosphor) }
        };
        g.FillEllipse(brush, area);
    }

    /// Text with a phosphor halo: a few faint offset copies, then the glyphs.
    public static void GlowText(Graphics g, string text, Font font, RectangleF rect, Color color, StringFormat format, float glow = 1f)
    {
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        if (glow > 0.01f)
        {
            using var halo = new SolidBrush(Color.FromArgb((int)(34 * glow), color));
            foreach (var (dx, dy) in new[] { (-1f, 0f), (1f, 0f), (0f, -1f), (0f, 1f), (-1.5f, -1.5f), (1.5f, 1.5f) })
                g.DrawString(text, font, halo, new RectangleF(rect.X + dx, rect.Y + dy, rect.Width, rect.Height), format);
        }
        using var brush = new SolidBrush(color);
        g.DrawString(text, font, brush, rect, format);
    }

    public static GraphicsPath RoundRect(Rectangle r, int radius)
    {
        var path = new GraphicsPath();
        if (radius <= 0) { path.AddRectangle(r); return path; }
        var d = radius * 2;
        path.AddArc(r.Left, r.Top, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Top, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    // --- dark window chrome -----------------------------------------------------

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    /// Dark title bar in the bezel colour on Windows 11 (silently ignored on
    /// older Windows, which just keeps its normal title bar).
    public static void DarkChrome(IntPtr hwnd)
    {
        try
        {
            var on = 1;
            DwmSetWindowAttribute(hwnd, 20, ref on, 4); // DWMWA_USE_IMMERSIVE_DARK_MODE
            var caption = Bezel.R | (Bezel.G << 8) | (Bezel.B << 16);
            DwmSetWindowAttribute(hwnd, 35, ref caption, 4); // DWMWA_CAPTION_COLOR
            var text = Phosphor.R | (Phosphor.G << 8) | (Phosphor.B << 16);
            DwmSetWindowAttribute(hwnd, 36, ref text, 4); // DWMWA_TEXT_COLOR
        }
        catch { }
    }
}

/// Header logo: the block "O2" types in row by row, then the title line types
/// out after it with a blinking block cursor. Now and then the tube "flickers"
/// for a frame, and the glow slowly breathes.
sealed class CrtLogo : Control
{
    private static readonly string[] Logo =
    {
        " ██████╗ ██████╗ ",
        "██╔═══██╗╚════██╗",
        "██║   ██║ █████╔╝",
        "██║   ██║██╔═══╝ ",
        "╚██████╔╝███████╗",
        " ╚═════╝ ╚══════╝",
    };

    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";

    private readonly long start = Crt.Now;
    private long nextFlicker = Crt.Now + 3500;
    private long flickerUntil;

    public CrtLogo()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw, true);
        BackColor = Crt.Screen;
        Crt.Subscribe(OnTick);
    }

    protected override void Dispose(bool disposing)
    {
        Crt.Unsubscribe(OnTick);
        base.Dispose(disposing);
    }

    private void OnTick()
    {
        var now = Crt.Now;
        if (now > nextFlicker)
        {
            flickerUntil = now + 70;
            nextFlicker = now + 4000 + Random.Shared.Next(5000);
        }
        if (IsHandleCreated && Visible) Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Crt.Screen);
        var t = Crt.Now - start;
        var breathe = 0.75f + 0.25f * (float)Math.Sin(t / 900.0);
        var flicker = Crt.Now < flickerUntil ? 0.55f : 1f;

        Crt.Glow(g, new Rectangle(-40, -30, 260, Height + 60), breathe * flicker);

        // O2 block logo, one row every 70ms.
        using var logoFont = Crt.Mono(Math.Max(7f, Height / 6.6f * 0.72f));
        var rowH = Height / 6f;
        var rows = (int)Math.Clamp(t / 70, 0, Logo.Length);
        using var fmt = new StringFormat(StringFormat.GenericTypographic) { FormatFlags = StringFormatFlags.NoWrap };
        var logoColor = Crt.Blend(Crt.Screen, Crt.Hot, 0.95f * flicker);
        for (var i = 0; i < rows; i++)
            Crt.GlowText(g, Logo[i], logoFont, new RectangleF(4, i * rowH, Width, rowH + 4), logoColor, fmt, breathe * flicker);

        var logoWidth = g.MeasureString(Logo[1], logoFont, PointF.Empty, fmt).Width;
        var textLeft = logoWidth + 28;

        // Title + subtitle type out after the logo, ~40 chars/sec.
        var typed = (int)Math.Max(0, (t - Logo.Length * 70 - 120) / 25);
        using var titleFont = Crt.Mono(19, true);
        using var subFont = Crt.Mono(9.5f);
        var title = Title[..Math.Min(Title.Length, typed)];
        var sub = Subtitle[..Math.Clamp(typed - Title.Length, 0, Subtitle.Length)];

        var titleRect = new RectangleF(textLeft, Height * 0.18f, Width - textLeft, Height * 0.4f);
        var subRect = new RectangleF(textLeft + 2, Height * 0.58f, Width - textLeft, Height * 0.3f);
        Crt.GlowText(g, title, titleFont, titleRect, Crt.Blend(Crt.Screen, Crt.Hot, flicker), fmt, flicker);
        Crt.GlowText(g, sub, subFont, subRect, Crt.Blend(Crt.Screen, Crt.Dim, flicker), fmt, 0.6f * flicker);

        // Block cursor after whatever is still typing, blinking once typed.
        var doneTyping = typed >= Title.Length + Subtitle.Length;
        if (!doneTyping || (Crt.Now / 530) % 2 == 0)
        {
            var onTitle = typed <= Title.Length;
            var font = onTitle ? titleFont : subFont;
            var rect = onTitle ? titleRect : subRect;
            var w = g.MeasureString(onTitle ? title : sub, font, PointF.Empty, fmt).Width;
            var cw = g.MeasureString("M", font, PointF.Empty, fmt).Width;
            var ch = font.GetHeight(g);
            using var cursor = new SolidBrush(Crt.Blend(Crt.Screen, Crt.Hot, flicker));
            g.FillRectangle(cursor, rect.X + w + 2, rect.Y + 2, cw * 0.9f, ch * 0.9f);
        }

        Crt.Scanlines(g, this, ClientRectangle, 40);
    }
}

/// The activity log as a real terminal: "> " prompt lines that type out one
/// character at a time (instant while an install is running, when the UI
/// thread is busy anyway), a blinking block cursor, a faint bright band that
/// rolls down the glass, mouse-wheel scrollback and a right-click menu.
sealed class TerminalView : Control
{
    private readonly List<(string Text, bool Alert)> lines = new();
    private readonly Queue<(string Text, bool Alert)> pending = new();
    private string typing = "";
    private bool typingAlert;
    private int typedChars;
    private int scrollBack; // wrapped rows scrolled up from the bottom
    private readonly long start = Crt.Now;

    public bool Instant { get; set; }
    public string LogPath { get; set; } = "";

    public TerminalView()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint | ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
        BackColor = Crt.Screen;
        Font = Crt.Mono(9.5f);
        Cursor = Cursors.IBeam;
        Crt.Subscribe(OnTick);

        var menu = new ContextMenuStrip { ShowImageMargin = false, BackColor = Crt.Screen, ForeColor = Crt.Text, Font = Crt.Mono(9) };
        menu.Renderer = new ToolStripProfessionalRenderer(new CrtMenuColors());
        menu.Items.Add("Copy log", null, (_, _) => CopyAll());
        menu.Items.Add("Open log file", null, (_, _) =>
        {
            try { if (File.Exists(LogPath)) System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(LogPath) { UseShellExecute = true }); } catch { }
        });
        ContextMenuStrip = menu;
    }

    protected override void Dispose(bool disposing)
    {
        Crt.Unsubscribe(OnTick);
        base.Dispose(disposing);
    }

    public void AppendLine(string message)
    {
        foreach (var raw in message.Replace("\r", "").Split('\n'))
        {
            var alert = raw.Contains("Exception", StringComparison.OrdinalIgnoreCase)
                || raw.Contains("error", StringComparison.OrdinalIgnoreCase)
                || raw.Contains("failed", StringComparison.OrdinalIgnoreCase);
            pending.Enqueue((raw, alert));
        }

        if (Instant) FlushAll();
        scrollBack = 0;
        if (IsHandleCreated)
        {
            Invalidate();
            // Installs run on the UI thread - paint right away so the log keeps
            // up instead of appearing all at once at the end.
            if (Instant) Update();
        }
    }

    private void FlushAll()
    {
        if (typing.Length > 0 || typedChars > 0) { lines.Add((typing, typingAlert)); typing = ""; typedChars = 0; }
        while (pending.Count > 0) lines.Add(pending.Dequeue());
        Trim();
    }

    private void Trim()
    {
        if (lines.Count > 600) lines.RemoveRange(0, lines.Count - 600);
    }

    private void OnTick()
    {
        if (!Instant)
        {
            // Type ~3 chars per tick (~90/s); short blank lines go instantly.
            var budget = 3 + pending.Count; // catch up when a lot is queued
            while (budget > 0)
            {
                if (typing.Length == 0 && typedChars == 0)
                {
                    if (pending.Count == 0) break;
                    (typing, typingAlert) = pending.Dequeue();
                    if (typing.Length == 0) { lines.Add(("", false)); continue; }
                }
                var step = Math.Min(budget, typing.Length - typedChars);
                typedChars += step;
                budget -= step;
                if (typedChars >= typing.Length)
                {
                    lines.Add((typing, typingAlert));
                    typing = "";
                    typedChars = 0;
                    Trim();
                }
            }
        }
        if (IsHandleCreated && Visible) Invalidate();
    }

    public void CopyAll()
    {
        FlushAll();
        var text = string.Join(Environment.NewLine, lines.Select(l => l.Text));
        if (text.Length > 0) Clipboard.SetText(text);
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
        scrollBack = Math.Max(0, scrollBack + (e.Delta > 0 ? 3 : -3));
        Invalidate();
        base.OnMouseWheel(e);
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        Focus();
        base.OnMouseDown(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Crt.Screen);
        Crt.Glow(g, new Rectangle(-Width / 4, -Height / 2, Width * 3 / 2, Height * 2), 0.55f);

        using var fmt = new StringFormat(StringFormat.GenericTypographic) { FormatFlags = StringFormatFlags.NoWrap | StringFormatFlags.MeasureTrailingSpaces };
        var charW = g.MeasureString("M", Font, PointF.Empty, fmt).Width;
        var lineH = (float)Math.Ceiling(Font.GetHeight(g) * 1.25f);
        var left = 10f;
        var cols = Math.Max(10, (int)((Width - left * 2 - charW * 2) / charW));

        // Wrap every line to the width; the one being typed goes last.
        var rows = new List<(string Text, Color Color, bool Prompt, bool Alert)>();
        void AddWrapped(string text, bool alert)
        {
            var color = alert ? Crt.Blend(Crt.Screen, Crt.Alert, 0.95f) : Crt.Text;
            if (text.Length == 0) { rows.Add(("", color, false, alert)); return; }
            for (var i = 0; i < text.Length; i += cols)
                rows.Add((text.Substring(i, Math.Min(cols, text.Length - i)), color, i == 0, alert));
        }
        foreach (var (text, alert) in lines) AddWrapped(text, alert);
        var typingNow = typing.Length > 0 ? typing[..typedChars] : null;
        if (typingNow is not null) AddWrapped(typingNow, typingAlert);

        var visible = Math.Max(1, (int)((Height - 12) / lineH) - 1);
        scrollBack = Math.Min(scrollBack, Math.Max(0, rows.Count + 1 - visible));
        var first = Math.Max(0, rows.Count + 1 - visible - scrollBack);
        var y = 8f;
        var lastX = left + charW * 2;
        var lastY = y;
        for (var i = first; i < rows.Count && y < Height - lineH; i++)
        {
            var (text, color, prompt, alert) = rows[i];
            // Black and white: errors are marked with "!" instead of a colour.
            if (prompt)
                Crt.GlowText(g, alert ? "!" : ">", Font, new RectangleF(left, y, charW * 2, lineH), alert ? Crt.Hot : Crt.Dim, fmt, alert ? 1f : 0.5f);
            Crt.GlowText(g, text, Font, new RectangleF(left + charW * 2, y, Width, lineH), color, fmt, 0.8f);
            lastX = left + charW * 2 + g.MeasureString(text, Font, PointF.Empty, fmt).Width;
            lastY = y;
            y += lineH;
        }

        // Block cursor: after the text being typed, else on a fresh prompt line.
        if (scrollBack == 0)
        {
            var idle = typingNow is null;
            if (idle)
            {
                lastY = rows.Count == 0 ? 8f : lastY + lineH;
                lastX = left + charW * 2;
                if (lastY < Height - lineH)
                    Crt.GlowText(g, ">", Font, new RectangleF(left, lastY, charW * 2, lineH), Crt.Dim, fmt, 0.5f);
            }
            if (!idle || (Crt.Now / 530) % 2 == 0)
            {
                using var cursor = new SolidBrush(Crt.Hot);
                g.FillRectangle(cursor, lastX + 1, lastY + 2, charW * 0.9f, lineH - 5);
            }
        }
        else
        {
            using var small = Crt.Mono(8);
            Crt.GlowText(g, $"-- {scrollBack} more below --", small, new RectangleF(0, Height - lineH, Width - 12, lineH), Crt.Dim,
                new StringFormat { Alignment = StringAlignment.Far }, 0.4f);
        }

        // Rolling bright band, like cool-retro-term's "glowing line".
        var period = 6500f;
        var phase = ((Crt.Now - start) % (long)period) / period;
        var bandH = Math.Max(40, Height / 4);
        var bandY = (int)(phase * (Height + bandH * 2)) - bandH;
        var band = new Rectangle(0, bandY, Width, bandH);
        using (var bandBrush = new LinearGradientBrush(new Rectangle(0, bandY - 1, Width, bandH + 2), Color.FromArgb(0, Crt.Phosphor), Color.FromArgb(0, Crt.Phosphor), LinearGradientMode.Vertical))
        {
            bandBrush.InterpolationColors = new ColorBlend
            {
                Colors = new[] { Color.FromArgb(0, Crt.Phosphor), Color.FromArgb(14, Crt.Phosphor), Color.FromArgb(0, Crt.Phosphor) },
                Positions = new[] { 0f, 0.5f, 1f }
            };
            g.FillRectangle(bandBrush, band);
        }

        Crt.Scanlines(g, this, ClientRectangle);
    }

    private sealed class CrtMenuColors : ProfessionalColorTable
    {
        public override Color MenuItemSelected => Crt.Wash;
        public override Color MenuItemBorder => Crt.Faint;
        public override Color MenuBorder => Crt.Faint;
        public override Color ToolStripDropDownBackground => Crt.Screen;
        public override Color ImageMarginGradientBegin => Crt.Screen;
        public override Color ImageMarginGradientMiddle => Crt.Screen;
        public override Color ImageMarginGradientEnd => Crt.Screen;
    }
}

/// Message box in the same terminal style (replaces the plain Windows one).
sealed class CrtDialog : Form
{
    private readonly string message;
    private readonly bool alert;
    private readonly long start = Crt.Now;
    private readonly RoundedButton ok = new();

    private CrtDialog(string title, string message, bool alert)
    {
        this.message = message;
        this.alert = alert;
        Text = title;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Crt.Bezel;
        Font = Crt.Mono(10);
        ClientSize = new Size(520, 250);
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);

        ok.Text = "OK";
        ok.Size = new Size(140, 40);
        ok.Location = new Point(ClientSize.Width - 140 - 26, ClientSize.Height - 40 - 22);
        ok.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
        ok.Kind = alert ? CrtButtonKind.Alert : CrtButtonKind.Primary;
        ok.Click += (_, _) => Close();
        Controls.Add(ok);
        AcceptButton = ok;
        CancelButton = ok;

        Crt.Subscribe(OnTick);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Crt.DarkChrome(Handle);
    }

    protected override void Dispose(bool disposing)
    {
        Crt.Unsubscribe(OnTick);
        base.Dispose(disposing);
    }

    private void OnTick()
    {
        if (IsHandleCreated) Invalidate(new Rectangle(0, 0, ClientSize.Width, ok.Top - 4));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Crt.Bezel);

        var screen = new Rectangle(12, 12, ClientSize.Width - 24, ClientSize.Height - 24);
        using (var path = Crt.RoundRect(screen, 10))
        using (var fill = new SolidBrush(Crt.Screen))
        using (var edge = new Pen(alert ? Crt.Blend(Crt.Screen, Crt.Alert, 0.5f) : Crt.Line))
        {
            g.FillPath(fill, path);
            Crt.Glow(g, new Rectangle(screen.X - 60, screen.Y - 40, screen.Width / 2 + 120, screen.Height + 80), 0.9f);
            g.DrawPath(edge, path);
        }

        var accent = alert ? Crt.Blend(Crt.Screen, Crt.Alert, 0.95f) : Crt.Hot;
        using var fmt = new StringFormat(StringFormat.GenericTypographic);
        using var head = Crt.Mono(11, true);
        Crt.GlowText(g, (alert ? "!! " : "> ") + Text.ToUpperInvariant(), head, new RectangleF(30, 28, screen.Width - 30, 26), accent, fmt);

        // Message types out, then the cursor blinks after it.
        var shown = (int)Math.Min(message.Length, (Crt.Now - start) / 12);
        var body = message[..shown];
        var bodyRect = new RectangleF(30, 62, screen.Width - 40, ok.Top - 70);
        Crt.GlowText(g, body, Font, bodyRect, alert ? Crt.Blend(Crt.Screen, Crt.Alert, 0.8f) : Crt.Text, new StringFormat(), 0.7f);
        if (shown < message.Length || (Crt.Now / 530) % 2 == 0)
        {
            var end = MeasureEnd(g, body, bodyRect);
            using var cursor = new SolidBrush(accent);
            g.FillRectangle(cursor, end.X + 2, end.Y + 3, 9, Font.GetHeight(g) - 5);
        }

        Crt.Scanlines(g, this, screen);
    }

    // Where the last character of the wrapped message ends up.
    private PointF MeasureEnd(Graphics g, string text, RectangleF rect)
    {
        if (text.Length == 0) return new PointF(rect.X, rect.Y);
        using var fmt = new StringFormat();
        fmt.SetMeasurableCharacterRanges(new[] { new CharacterRange(text.Length - 1, 1) });
        var regions = g.MeasureCharacterRanges(text, Font, rect, fmt);
        if (regions.Length == 0) return new PointF(rect.X, rect.Y);
        var b = regions[0].GetBounds(g);
        return new PointF(b.Right, b.Top);
    }

    public static void Show(IWin32Window? owner, string title, string message, bool alert = false)
    {
        using var dialog = new CrtDialog(title, message, alert);
        if (owner is null) dialog.StartPosition = FormStartPosition.CenterScreen;
        dialog.ShowDialog(owner);
    }
}
