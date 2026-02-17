# MULTIPLE BREAKS - MIGRATION & USAGE GUIDE

## 🎯 Overview

The new implementation supports **unlimited breaks per day** using a PostgreSQL JSONB column.

---

## 📊 Database Schema Changes

### OLD SCHEMA (Single Break)
```sql
CREATE TABLE partner_hours (
  id UUID PRIMARY KEY,
  partner_id UUID,
  day_of_week INT,
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN,
  break_start TIME,      -- ❌ Only one break
  break_end TIME         -- ❌ Only one break
);
```

### NEW SCHEMA (Multiple Breaks)
```sql
CREATE TABLE partner_hours (
  id UUID PRIMARY KEY,
  partner_id UUID,
  day_of_week INT,
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN,
  breaks JSONB DEFAULT '[]'::jsonb,  -- ✅ Unlimited breaks
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### MIGRATION SQL
```sql
-- Add breaks column
ALTER TABLE partner_hours 
ADD COLUMN IF NOT EXISTS breaks JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single break to array format (optional)
UPDATE partner_hours 
SET breaks = jsonb_build_array(
  jsonb_build_object(
    'start', break_start::text,
    'end', break_end::text
  )
)
WHERE break_start IS NOT NULL 
  AND break_end IS NOT NULL;

-- Optional: Add GIN index for performance
CREATE INDEX IF NOT EXISTS idx_partner_hours_breaks 
ON partner_hours USING GIN (breaks);

-- Optional: Drop old columns after migration verified
-- ALTER TABLE partner_hours DROP COLUMN break_start;
-- ALTER TABLE partner_hours DROP COLUMN break_end;
```

---

## 📝 API Usage Examples

### 1. Setting Hours with Multiple Breaks

**Restaurant with lunch/dinner service:**
```javascript
const hoursData = [
  {
    day_of_week: 1, // Monday
    opens_at: "11:00",
    closes_at: "22:00",
    is_closed: false,
    breaks: [
      { start: "15:00", end: "17:00" },  // Afternoon break
      { start: "20:30", end: "21:00" }   // Kitchen prep
    ]
  },
  {
    day_of_week: 2, // Tuesday
    opens_at: "11:00",
    closes_at: "22:00",
    is_closed: false,
    breaks: [
      { start: "15:00", end: "17:00" }   // Single break
    ]
  },
  {
    day_of_week: 0, // Sunday - Closed
    is_closed: true,
    breaks: []
  }
  // ... remaining 4 days
];

await setPartnerHours(partnerId, hoursData);
```

**Clinic with multiple doctor breaks:**
```javascript
const hoursData = [
  {
    day_of_week: 1, // Monday
    opens_at: "08:00",
    closes_at: "18:00",
    is_closed: false,
    breaks: [
      { start: "10:00", end: "10:15" },  // Coffee break
      { start: "12:00", end: "13:00" },  // Lunch
      { start: "15:00", end: "15:15" }   // Afternoon break
    ]
  }
  // ... remaining days
];
```

**Nightclub with overnight hours + break:**
```javascript
const hoursData = [
  {
    day_of_week: 5, // Friday
    opens_at: "22:00",
    closes_at: "04:00",  // Overnight
    is_closed: false,
    breaks: [
      { start: "01:00", end: "01:30" }   // DJ change/cleanup
    ]
  }
];
```

**No breaks:**
```javascript
const hoursData = [
  {
    day_of_week: 1,
    opens_at: "09:00",
    closes_at: "17:00",
    is_closed: false,
    breaks: []  // No breaks - continuous service
  }
];
```

---

## 🔍 Reading Hours (API Response)

### GET /partners/:id/hours

**Response:**
```json
{
  "Monday": {
    "day_of_week": 1,
    "opens_at": "11:00",
    "closes_at": "22:00",
    "is_closed": false,
    "breaks": [
      { "start": "15:00", "end": "17:00" },
      { "start": "20:30", "end": "21:00" }
    ],
    "is_overnight": false
  },
  "Friday": {
    "day_of_week": 5,
    "opens_at": "22:00",
    "closes_at": "04:00",
    "is_closed": false,
    "breaks": [
      { "start": "01:00", "end": "01:30" }
    ],
    "is_overnight": true
  },
  "Sunday": {
    "day_of_week": 0,
    "is_closed": true,
    "breaks": []
  }
}
```

---

## ✅ Validation Logic

### Break Validation Rules

1. **Each break must have start AND end**
   ```javascript
   ❌ { start: "14:00" }           // Missing end
   ✅ { start: "14:00", end: "15:00" }
   ```

2. **Start must be before end**
   ```javascript
   ❌ { start: "15:00", end: "14:00" }
   ✅ { start: "14:00", end: "15:00" }
   ```

3. **Breaks must be within operating hours**
   ```javascript
   Opens: 10:00, Closes: 22:00
   ❌ { start: "09:00", end: "10:30" }  // Starts before opening
   ❌ { start: "21:00", end: "23:00" }  // Ends after closing
   ✅ { start: "14:00", end: "15:00" }
   ```

4. **Breaks cannot overlap**
   ```javascript
   ❌ [
     { start: "14:00", end: "16:00" },
     { start: "15:00", end: "17:00" }  // Overlaps with previous
   ]
   
   ✅ [
     { start: "14:00", end: "15:00" },
     { start: "16:00", end: "17:00" }  // No overlap
   ]
   ```

5. **For overnight services, breaks cannot span midnight**
   ```javascript
   Opens: 22:00, Closes: 04:00 (overnight)
   
   ✅ { start: "23:00", end: "23:30" }  // Fully in evening
   ✅ { start: "02:00", end: "03:00" }  // Fully in morning
   ❌ { start: "23:00", end: "01:00" }  // Spans midnight
   ```

---

## 🧪 Test Scenarios

### Scenario 1: Restaurant with afternoon break
```javascript
// Hours: 11:00 - 22:00
// Break: 15:00 - 17:00

✅ Booking at 14:00 (60 min) → Valid (ends before break)
❌ Booking at 14:30 (60 min) → Invalid (overlaps break)
❌ Booking at 16:00 (60 min) → Invalid (starts during break)
✅ Booking at 17:00 (60 min) → Valid (starts after break)
```

### Scenario 2: Clinic with multiple breaks
```javascript
// Hours: 08:00 - 18:00
// Breaks: 10:00-10:15, 12:00-13:00, 15:00-15:15

✅ Booking at 09:00 (30 min) → Valid
❌ Booking at 09:50 (30 min) → Invalid (overlaps 10:00-10:15)
✅ Booking at 10:15 (30 min) → Valid (starts after break)
❌ Booking at 11:30 (60 min) → Invalid (overlaps 12:00-13:00)
✅ Booking at 13:00 (30 min) → Valid
```

### Scenario 3: Nightclub overnight with break
```javascript
// Hours: 22:00 - 04:00 (overnight)
// Break: 01:00 - 01:30

✅ Booking at 23:00 (60 min) → Valid
❌ Booking at 00:45 (60 min) → Invalid (overlaps break)
✅ Booking at 01:30 (60 min) → Valid
```

---

## 🚀 Frontend UI Recommendations

### Add/Remove Breaks Interface

```jsx
// React Component Example
function BreakManager({ breaks, onChange }) {
  const addBreak = () => {
    onChange([...breaks, { start: "", end: "" }]);
  };

  const removeBreak = (index) => {
    onChange(breaks.filter((_, i) => i !== index));
  };

  const updateBreak = (index, field, value) => {
    const updated = [...breaks];
    updated[index][field] = value;
    onChange(updated);
  };

  return (
    <div>
      <h3>Break Periods</h3>
      {breaks.map((brk, idx) => (
        <div key={idx} className="break-row">
          <input
            type="time"
            value={brk.start}
            onChange={(e) => updateBreak(idx, 'start', e.target.value)}
            placeholder="Start"
          />
          <input
            type="time"
            value={brk.end}
            onChange={(e) => updateBreak(idx, 'end', e.target.value)}
            placeholder="End"
          />
          <button onClick={() => removeBreak(idx)}>Remove</button>
        </div>
      ))}
      <button onClick={addBreak}>+ Add Break</button>
    </div>
  );
}
```

---

## 📊 Database Query Examples

### Find all partners with breaks on Monday
```sql
SELECT 
  p.name,
  ph.opens_at,
  ph.closes_at,
  ph.breaks
FROM partners p
JOIN partner_hours ph ON p.id = ph.partner_id
WHERE ph.day_of_week = 1  -- Monday
  AND jsonb_array_length(ph.breaks) > 0;
```

### Find partners with more than 2 breaks on any day
```sql
SELECT 
  p.name,
  ph.day_of_week,
  jsonb_array_length(ph.breaks) as break_count
FROM partners p
JOIN partner_hours ph ON p.id = ph.partner_id
WHERE jsonb_array_length(ph.breaks) > 2;
```

### Find specific break time
```sql
SELECT *
FROM partner_hours
WHERE breaks @> '[{"start": "14:00"}]'::jsonb;
```

---

## 🔧 Backward Compatibility

The new system is **backward compatible**:

1. **Old code without breaks** → Works (breaks default to `[]`)
2. **Existing single break columns** → Can be migrated or kept alongside
3. **API accepts empty breaks array** → No breaks = continuous service

---

## ⚠️ Important Notes

1. **JSONB is PostgreSQL-specific** - For MySQL, use JSON column type
2. **Always validate breaks before saving** - Use `validateTimeRange()`
3. **Breaks are optional** - Empty array `[]` means continuous service
4. **Breaks are sorted automatically** - System handles ordering
5. **Time format is HH:MM** - Use 24-hour format only

---

## 📈 Performance Considerations

- **JSONB is indexed** - Add GIN index for fast queries
- **Validation is in-memory** - Fast break overlap checks
- **Database size** - Minimal increase (JSONB is efficient)
- **Query performance** - Use indexed lookups when possible

---

## 🎉 Benefits of This Approach

✅ **Unlimited breaks** - No hardcoded limit  
✅ **Flexible** - Easy to add/remove breaks  
✅ **Clean schema** - Single column vs multiple  
✅ **Type-safe** - PostgreSQL validates JSON structure  
✅ **Queryable** - Can search within breaks using JSONB operators  
✅ **Backward compatible** - Works with existing code  
✅ **Future-proof** - Easy to extend (add break names, types, etc.)

---

## 🔮 Future Enhancements

Possible additions to the breaks structure:
```javascript
breaks: [
  {
    start: "14:00",
    end: "15:00",
    name: "Lunch Break",           // Optional: Named breaks
    type: "required",               // Optional: required vs optional
    staff_only: false,              // Optional: Staff break vs venue break
    recurring: true                 // Optional: Regular vs one-time
  }
]
```
