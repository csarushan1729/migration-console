/** Apex Manufacturing — messy multi-system dump used as the default engagement. */

export const SAMPLE_CLIENT = "Apex Manufacturing Pvt Ltd";
export const SAMPLE_ENGAGEMENT = "Employee master · cutover to Darwinbox";

export const LEGACY_HRIS_CSV = `\uFEFFEmpCode,Employee Name,DOB,Gender,Dept,Designation,Title,DOJ,Status,PAN,Location,GrossCTC,Cost Center,EmpType
APX-1001,RAJESH KUMAR,21/03/1988,M,Manufacturing,Plant Supervisor,Supervisor,15-Jun-2014,Active,ABCDE1234F,Pune Plant,980000,MFG-PUN,Permanent
APX-1002,Priya Mehta,1992-07-21,Female,Human Resources,HR Business Partner,HR BP,2019-08-01,Active,XYZAB5678C,Pune HO,1450000,HR-PUN,Permanent
APX-1003,Dr. Arun Nair,14-Nov-1979,Male,Manufacturing,Plant Head,Plant Head,03-Feb-2009,Active,PQRST9012U,Pune Plant,2860000,MFG-PUN,Permanent
APX-1004,Sneha Iyer,1994-01-09,F,Finance,Accounts Executive,Executive,22/07/2021,Active,LMNOP3456Q,Mumbai,780000,FIN-MUM,Contract
APX-1005,Deepak Verma,18/12/1991,Transgender,Quality,Quality Engineer,QE,2017-04-03,Active,AAAAA1111A,Pune Plant,810000,QMS-PUN,Permanent
APX-1006,Kavya Sharma,05/06/1991,Female,Sales,Regional Sales Manager,RSM,11-Oct-2018,Active,BBBBB2222B,Delhi,1320000,SAL-DEL,Permanent
APX-1007,Meera Joshi,27/02/1990,F,Human Resources,Recruiter,Recruiter,2016-09-12,Active,CCCCC3333C,Pune HO,610000,HR-PUN,Permanent
APX-1008,Amit Patel,03-Nov-1990,M,Finance,Accounts Executive,Executive,2018-03-22,Active,,Mumbai,640000,FIN-MUM,Permanent
APX-1009,Vikram Singh,1993-08-30,Male,Sales,Sales Executive,Executive,02-Nov-2020,Active,DDDDD4444D,Delhi Sales,1100000,SAL-DEL,Permanent
APX-1010,Farhan Qureshi,16/05/1987,M,IT,Systems Engineer,Engineer,2015-01-19,Active,EEEEE5555E,Pune HO,890000,IT-PUN,Permanent
APX-1012,Neha Kapoor,1995-09-02,Female,Manufacturing,Shift Lead,Lead,2022-01-10,Absconding,FFFFF6666F,Pune Plant,540000,MFG-PUN,Permanent
APX-1013,Rohan Desai,09-Dec-1985,Male,Quality,Quality Manager,Manager,2012-06-01,Active,GGGGG7777G,Pune Plant,1680000,QMS-PUN,Permanent
APX-1014,Pooja,21/07/1996,F,Finance,Payroll Specialist,Specialist,2023-03-15,Active,HHHHH8888H,Mumbai,720000,FIN-MUM,Permanent
`;

export const PAYROLL_CSV = `employee_no,first_name,last_name,join_date,employment_type,ctc,currency,email_official,Pay Date
1001,Rajesh,Kumar,2014-06-15,Permanent,920000,INR,rajesh.kumar@apexmfg.in,2026-08-31
1002,Priya,Mehta,2019-08-01,Permanent,1450000,INR,priya.mehta@apexmfg.in,2026-08-31
1002,Priya,Mehta,2019-08-01,Permanent,1450000,INR,priya.mehta@apexmfg.in,2026-08-31
1003,Arun,Nair,2009-02-03,Permanent,2860000,INR,arun.nair@apexmfg.in,2026-08-31
1004,Sneha,Iyer,2021-07-22,Contract,780000,INR,sneha.iyer@apexmfg.in,2026-08-31
1005,Deepak,Verma,2017-04-03,Permanent,810000,INR,deepak.verma@apexmfg.in,2026-08-31
1006,Kavya,Sharma,2018-10-11,Permanent,1320000,INR,kavya.sharma@apexmfg.in,2026-08-31
1008,Amit,Patel,2018-03-22,Permanent,640000,INR,amit.patel@apexmfg.in,2026-08-31
1009,Vikram,Singh,2020-11-02,Permanent,1100000,INR,,2026-08-31
1010,Farhan,Qureshi,2015-01-19,Permanent,890000,INR,farhan.qureshi@apexmfg.in,2026-08-31
1011,Ananya,Rao,2022-05-16,Intern,240000,INR,ananya.rao@apexmfg.in,2026-08-31
1012,Neha,Kapoor,2022-01-10,Permanent,540000,INR,neha.kapoor@apexmfg.in,2026-08-31
1013,Rohan,Desai,2012-06-01,Permanent,1680000,INR,rohan.desai@apexmfg.in,2026-08-31
1014,Pooja,Nair,2023-03-15,Permanent,720000,INR,pooja.nair@apexmfg.in,2026-08-31
`;

export const IT_DIRECTORY_CSV = `username,display_name,work_email,manager_emp_id,office,mobile,emp_id,role
rkumar,Rajesh Kumar,rajesh.kumar@apexmfg.in,1003,Pune - Plant 1,+91 98765 43210,APX-1001,Supervisor
pmehta,Priya Mehta,priya.mehta@apexmfg.in,1003,Head Office Pune,9876543211,APX-1002,HR Business Partner
anair,Arun Nair,arun.nair@apexmfg.in,,Pune - Plant 1,9820011003,APX-1003,Plant Head
dverma,Deepak Verma,deepak.verma@apexmfg.in,1013,Pune - Plant 1,9000010005,APX-1005,Quality Engineer
ksharma,Kavya Sharma,kavya.sharma@apexmfg.in,1003,Delhi Sales,9810011006,APX-1006,Regional Sales Manager
mjoshi,Meera Joshi,meera.joshi@apexmfg.in,1002,Head Office Pune,9810011007,APX-1007,Recruiter
apatel,Amit Patel,amit.patel@apexmfg.in,1003,Mumbai Finance,9810011008,APX-1008,Accounts Executive
vsingh,Vikram Singh,vikram.s@gmail.com,1006,Delhi Sales,9988776655,APX-1009,Sales Executive
fqureshi,Farhan Qureshi,farhan.qureshi@apexmfg.in,1003,Head Office Pune,9810091010,APX-1010,Systems Engineer
fqureshi2,F. Qureshi,f.qureshi@apexmfg.in,1003,Head Office Pune,9810091010,APX-1010B,Sys Engineer
arao,Ananya Rao,ananya.rao@apexmfg.in,1007,Head Office Pune,9810011011,APX-1011,Intern
rdesai,Rohan Desai,rohan.desai@apexmfg.in,1003,Pune - Plant 1,9810011013,APX-1013,Quality Manager
pnair,Pooja Nair,pooja.nair@apexmfg.in,1003,Mumbai Finance,9810011014,APX-1014,Payroll Specialist
`;

export const SAMPLE_FILES = [
  { name: "legacy_hris_employees.csv", kind: "csv" as const, text: LEGACY_HRIS_CSV },
  { name: "payroll_master.csv", kind: "csv" as const, text: PAYROLL_CSV },
  { name: "it_directory.xlsx", kind: "xlsx" as const, text: IT_DIRECTORY_CSV },
];
