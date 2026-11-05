-- Plantillas de correo de La Gruta: verificación y recuperación por OTP.
update email.templates
set subject = 'Confirme su correo - La Gruta',
    body_html = $html$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Confirme su correo - La Gruta</title>
</head>
<body style="margin:0;padding:0;background:#FBF7F0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Confirme su correo para activar su cuenta en La Gruta.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF7F0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E7E0D4;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="background:#3B1F7A;padding:28px 24px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;letter-spacing:6px;color:#FEF3C7;font-weight:700;">LA GRUTA</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;color:#EFEAF8;margin-top:6px;text-transform:uppercase;">Anuncios por megafon&iacute;a</div>
          </td>
        </tr>
        <tr><td style="height:4px;background:#A16207;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:34px 30px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;color:#A16207;font-weight:700;text-transform:uppercase;">Verificaci&oacute;n de correo</div>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#1F1633;margin:10px 0 12px;">Confirme su correo</h1>
            <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#564F66;margin:0 0 24px;">Gracias por unirse a La Gruta. Para activar su cuenta y empezar a enviar sus anuncios, escriba este c&oacute;digo en la pantalla de verificaci&oacute;n.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;">
              <tr>
                <td style="background:#EFEAF8;border:2px solid #3B1F7A;border-radius:14px;padding:16px 20px;text-align:center;">
                  <div style="font-family:'Courier New',Courier,monospace;font-size:32px;line-height:1;letter-spacing:6px;color:#3B1F7A;font-weight:700;">{{ token }}</div>
                </td>
              </tr>
            </table>
            <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#564F66;text-align:center;margin:0 0 24px;">El c&oacute;digo vence en <strong style="color:#1F1633;">15 minutos</strong>.</p>
            <div style="border-top:1px solid #E7E0D4;padding-top:20px;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#564F66;margin:0;">Si no cre&oacute; una cuenta en La Gruta, ignore este mensaje. No se activar&aacute; nada.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#FBF7F0;padding:20px 30px;text-align:center;border-top:1px solid #E7E0D4;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.4;color:#3B1F7A;font-weight:700;">La Gruta</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#564F66;margin-top:4px;">Anuncios por megafon&iacute;a &middot; Mensaje autom&aacute;tico</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>$html$,
    updated_at = now()
where template_type = 'email-verification-code';

update email.templates
set subject = 'Restablezca su clave - La Gruta',
    body_html = $html$<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restablezca su clave - La Gruta</title>
</head>
<body style="margin:0;padding:0;background:#FBF7F0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Restablezca la clave de su cuenta de La Gruta.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FBF7F0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E7E0D4;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="background:#3B1F7A;padding:28px 24px;text-align:center;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;letter-spacing:6px;color:#FEF3C7;font-weight:700;">LA GRUTA</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;color:#EFEAF8;margin-top:6px;text-transform:uppercase;">Anuncios por megafon&iacute;a</div>
          </td>
        </tr>
        <tr><td style="height:4px;background:#A16207;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:34px 30px 28px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;color:#A16207;font-weight:700;text-transform:uppercase;">Seguridad de la cuenta</div>
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#1F1633;margin:10px 0 12px;">Cree una nueva clave</h1>
            <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#564F66;margin:0 0 24px;">Recibimos una solicitud para cambiar la contrase&ntilde;a de su cuenta en La Gruta. Escriba este c&oacute;digo en la pantalla de recuperaci&oacute;n.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;">
              <tr>
                <td style="background:#EFEAF8;border:2px solid #3B1F7A;border-radius:14px;padding:16px 20px;text-align:center;">
                  <div style="font-family:'Courier New',Courier,monospace;font-size:32px;line-height:1;letter-spacing:6px;color:#3B1F7A;font-weight:700;">{{ token }}</div>
                </td>
              </tr>
            </table>
            <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#564F66;text-align:center;margin:0 0 24px;">El c&oacute;digo vence en <strong style="color:#1F1633;">15 minutos</strong>.</p>
            <div style="border-top:1px solid #E7E0D4;padding-top:20px;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#564F66;margin:0;">Si no solicit&oacute; el cambio, ignore este mensaje. Su contrase&ntilde;a actual sigue vigente.</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#FBF7F0;padding:20px 30px;text-align:center;border-top:1px solid #E7E0D4;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.4;color:#3B1F7A;font-weight:700;">La Gruta</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#564F66;margin-top:4px;">Anuncios por megafon&iacute;a &middot; Mensaje autom&aacute;tico</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>$html$,
    updated_at = now()
where template_type = 'reset-password-code';
