import { describe, expect, it } from 'vitest';
import { StubTicketExtractor } from './stub-ticket-extractor';
import { dollarsToCents, parseTicket } from './ticket-extractor';

describe('parseTicket', () => {
  it('parses a Fines-Victoria-shaped reply and converts dollars to cents', () => {
    const reply = JSON.stringify({
      noticeType: 'Notice of Final Demand',
      noticeNumber: '254790520',
      infringementNumber: '254790520',
      obligationNumber: '2616456356',
      rego: 'bbw027',
      state: 'vic',
      agency: 'Melbourne City Council',
      offence: 'PARKED FAIL TO PAY FEE',
      offenceCode: '0702',
      offenceDate: '18 MAR 2026',
      offenceTime: '5:33pm',
      location: "A'BECKETT STREET",
      issueDate: '13 JUL 2026',
      dueDate: '10 AUG 2026',
      penalty: 102.0,
      fees: 184.8,
      amountDue: 286.8,
      recipientName: 'MAHAVIR INSULATION PTY LTD',
      recipientAbn: '608111477',
      recipientAddress: 'U 7 5 SCANLON DR, EPPING VIC 3076',
      notes: '',
    });
    const t = parseTicket(reply);
    expect(t.rego).toBe('BBW027'); // uppercased
    expect(t.state).toBe('VIC');
    expect(t.amountDueCents).toBe(28680);
    expect(t.penaltyCents).toBe(10200);
    expect(t.feesCents).toBe(18480);
    expect(t.agency).toBe('Melbourne City Council');
    expect(t.dueDate).toBe('10 AUG 2026');
  });

  it('falls back to the infringement/obligation number when noticeNumber is absent', () => {
    expect(parseTicket('{"infringementNumber":"999"}').noticeNumber).toBe('999');
    expect(parseTicket('{"obligationNumber":"777"}').noticeNumber).toBe('777');
  });

  it('tolerates surrounding prose and missing fields', () => {
    const t = parseTicket('Here you go:\n{"rego":"1ab2cd","amountDue":"50"}\nThanks!');
    expect(t.rego).toBe('1AB2CD');
    expect(t.amountDueCents).toBe(5000);
    expect(t.noticeType).toBe(''); // missing → blank, not an error
  });

  it('throws on a reply with no JSON object', () => {
    expect(() => parseTicket('no json here')).toThrow();
  });
});

describe('dollarsToCents', () => {
  it('handles numbers, strings with symbols, and junk', () => {
    expect(dollarsToCents(102)).toBe(10200);
    expect(dollarsToCents('$286.80')).toBe(28680);
    expect(dollarsToCents('286.80')).toBe(28680);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents(undefined)).toBe(0);
  });
});

describe('StubTicketExtractor', () => {
  it('returns a blank draft with a guidance note (does not invent data)', async () => {
    const stub = new StubTicketExtractor();
    const out = await stub.extract([{ contentType: 'image/jpeg', dataBase64: 'abc' }]);
    expect(out.rego).toBe('');
    expect(out.amountDueCents).toBe(0);
    expect(out.notes).toMatch(/not configured/i);
  });

  it('throws when given no files', async () => {
    await expect(new StubTicketExtractor().extract([])).rejects.toThrow();
  });
});
